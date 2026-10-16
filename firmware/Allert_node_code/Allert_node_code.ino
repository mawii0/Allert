#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cSps30.h>
#include <Adafruit_SHT4x.h>

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include "node-logic.h"
#include <WiFiManager.h>
#include <LittleFS.h>
#include "node_secrets.h"
#if ALLERT_UPLOAD_MODE < 0 || ALLERT_UPLOAD_MODE > 2
#error "ALLERT_UPLOAD_MODE must be 0 (local FastAPI), 1 (Supabase), or 2 (hosted FastAPI)."
#endif
#if ALLERT_UPLOAD_MODE == 2 && !defined(ALLERT_HOSTED_API_URL)
#error "Define ALLERT_HOSTED_API_URL in private node_secrets.h before selecting hosted FastAPI mode."
#endif
#if ALLERT_UPLOAD_MODE == 1 || ALLERT_UPLOAD_MODE == 2
#include "tls_roots.h"
#endif
#include <time.h>


// ============================================================
// ALLERT SENSOR NODE
// ESP8266 + SPS30 + SHT40
//
// Sampling:
//   - Sensor reading every 10 seconds
//   - 5-minute block average
//   - 30 expected samples
//   - Completed blocks queued locally; local FastAPI, HTTPS Supabase, or HTTPS hosted FastAPI
// ============================================================


// ============================================================
// I2C
// ============================================================

#define I2C_SDA_PIN 4    // D2
#define I2C_SCL_PIN 5    // D1


// ============================================================
// SAMPLING
// ============================================================

#define RAW_SAMPLE_INTERVAL 10000UL     // 10 seconds
#define BLOCK_INTERVAL      300000UL    // 5 minutes

#define EXPECTED_SAMPLES 30

// Provisional block threshold:
// Incomplete blocks are retained as GAP_FLAGGED, matching the model acceptance rule.
#define MIN_VALID_SAMPLES EXPECTED_SAMPLES


// ============================================================
// SENSOR VALIDATION
// ============================================================

#define PM_MIN 0.0
#define PM_MAX 1000.0

#define TEMP_MIN -40.0
#define TEMP_MAX 125.0

#define HUM_MIN 0.0
#define HUM_MAX 100.0


// ============================================================
// WIFI
// ============================================================

// Per-node setup hotspot password. Set once before flashing; do not commit its real value.
const char* SETUP_AP_PASSWORD = ALLERT_SETUP_AP_PASSWORD;

// The upload URL can also be changed through the node's Wi-Fi portal.
char SERVER_URL[160] = "http://192.168.254.103:8000/api/sensor-data";
bool configStorageReady = false;
const char* SERVER_CONFIG_PATH = "/upload-server.txt";
const uint16_t MAX_QUEUED_BLOCKS = 864; // At most 72 hours at five-minute cadence.
uint32_t blockEndEpoch = 0;
bool blockCollecting = false;
uint32_t lastUploadAttempt = 0;
uint32_t uploadBackoff = 30000;
String preferredPacket;
#if ALLERT_UPLOAD_MODE == 1 || ALLERT_UPLOAD_MODE == 2
BearSSL::X509List trustAnchor(ALLERT_TLS_ROOT_CA);
#endif

// ============================================================
// NTP
// ============================================================

const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";

// Philippines = UTC+8
const long GMT_OFFSET_SEC = 8 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;


// ============================================================
// SENSOR OBJECTS
// ============================================================

SensirionI2cSps30 sps30;

Adafruit_SHT4x sht40 = Adafruit_SHT4x();


// ============================================================
// ERROR
// ============================================================

static int16_t error;


// ============================================================
// SENSOR READING
// ============================================================

struct SensorReading {

  float pm2_5;
  float pm10;

  float temperature;
  float humidity;

  bool valid;
};


// ============================================================
// BLOCK ACCUMULATOR
// ============================================================

struct BlockAccumulator {

  double sumPM2_5;
  double sumPM10;

  double sumTemperature;
  double sumHumidity;

  double sumPM2_5Squared;

  uint32_t sampleCount;


  void reset() {

    sumPM2_5 = 0;
    sumPM10 = 0;

    sumTemperature = 0;
    sumHumidity = 0;

    sumPM2_5Squared = 0;

    sampleCount = 0;
  }


  void add(const SensorReading &reading) {

    if (!reading.valid || sampleCount >= EXPECTED_SAMPLES) {
      return;
    }

    sumPM2_5 += reading.pm2_5;
    sumPM10 += reading.pm10;

    sumTemperature += reading.temperature;
    sumHumidity += reading.humidity;

    sumPM2_5Squared +=
      (double)reading.pm2_5 *
      (double)reading.pm2_5;

    sampleCount++;
  }
};


BlockAccumulator block;


// ============================================================
// TIMING
// ============================================================

unsigned long lastRawSample = 0;
unsigned long lastBlockAverage = 0;


// ============================================================
// SPS30 ERROR
// ============================================================

void printSPS30Error(
  const char* operation,
  int16_t errorCode
) {

  Serial.print("[SPS30 ERROR] ");
  Serial.print(operation);

  Serial.print(" | Error code: ");
  Serial.println(errorCode);
}


// ============================================================
// INITIALIZE SPS30
// ============================================================

void initSPS30() {

  Serial.println();
  Serial.println("Initializing SPS30...");


  sps30.begin(
    Wire,
    SPS30_I2C_ADDR_69
  );


  // Stop previous measurement
  error = sps30.stopMeasurement();

  if (error != 0) {

    printSPS30Error(
      "stopMeasurement",
      error
    );
  }


  delay(100);


  // Start measurement
  error = sps30.startMeasurement(
    SPS30_OUTPUT_FORMAT_OUTPUT_FORMAT_UINT16
  );


  if (error != 0) {

    printSPS30Error(
      "startMeasurement",
      error
    );

    Serial.println(
      "SPS30 measurement failed to start."
    );

  } else {

    Serial.println(
      "SPS30 measurement started."
    );
  }
}


// ============================================================
// INITIALIZE SHT40
// ============================================================

void initSHT40() {

  Serial.println();
  Serial.println("Initializing SHT40...");


  if (!sht40.begin(&Wire)) {

    Serial.println(
      "SHT40 initialization FAILED."
    );

    return;
  }


  sht40.setPrecision(
    SHT4X_HIGH_PRECISION
  );


  sht40.setHeater(
    SHT4X_NO_HEATER
  );


  Serial.println(
    "SHT40 initialized."
  );
}


// ============================================================
// READ SENSORS
// ============================================================

SensorReading readSensors() {

  SensorReading reading;


  reading.pm2_5 = NAN;
  reading.pm10 = NAN;

  reading.temperature = NAN;
  reading.humidity = NAN;

  reading.valid = false;


  // ----------------------------------------------------------
  // SPS30 DATA READY
  // ----------------------------------------------------------

  uint16_t dataReadyFlag = 0;


  error = sps30.readDataReadyFlag(
    dataReadyFlag
  );


  if (error != 0) {

    printSPS30Error(
      "readDataReadyFlag",
      error
    );

    return reading;
  }


  if (dataReadyFlag == 0) {

    return reading;
  }


  // ----------------------------------------------------------
  // SPS30 VALUES
  // ----------------------------------------------------------

  uint16_t mc1p0 = 0;
  uint16_t mc2p5 = 0;
  uint16_t mc4p0 = 0;
  uint16_t mc10p0 = 0;

  uint16_t nc0p5 = 0;
  uint16_t nc1p0 = 0;
  uint16_t nc2p5 = 0;
  uint16_t nc4p0 = 0;
  uint16_t nc10p0 = 0;

  uint16_t typicalParticleSize = 0;


  error = sps30.readMeasurementValuesUint16(

    mc1p0,
    mc2p5,
    mc4p0,
    mc10p0,

    nc0p5,
    nc1p0,
    nc2p5,
    nc4p0,
    nc10p0,

    typicalParticleSize
  );


  if (error != 0) {

    printSPS30Error(
      "readMeasurementValuesUint16",
      error
    );

    return reading;
  }


  // We only use PM2.5 and PM10
  reading.pm2_5 = (float)mc2p5;
  reading.pm10 = (float)mc10p0;


  // ----------------------------------------------------------
  // SHT40
  // ----------------------------------------------------------

  sensors_event_t humidityEvent;
  sensors_event_t temperatureEvent;


  bool shtSuccess = sht40.getEvent(
    &humidityEvent,
    &temperatureEvent
  );


  if (!shtSuccess) {

    Serial.println(
      "[SHT40 ERROR] Failed to read SHT40."
    );

    return reading;
  }


  reading.temperature =
    temperatureEvent.temperature;

  reading.humidity =
    humidityEvent.relative_humidity;


  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  if (!isfinite(reading.pm2_5) ||
      !isfinite(reading.pm10) ||
      !isfinite(reading.temperature) ||
      !isfinite(reading.humidity)) {

    return reading;
  }


  if (reading.pm2_5 < PM_MIN ||
      reading.pm2_5 > PM_MAX) {

    Serial.println(
      "[VALIDATION] PM2.5 out of range."
    );

    return reading;
  }


  if (reading.pm10 < PM_MIN ||
      reading.pm10 > PM_MAX) {

    Serial.println(
      "[VALIDATION] PM10 out of range."
    );

    return reading;
  }


  if (reading.temperature < TEMP_MIN ||
      reading.temperature > TEMP_MAX) {

    Serial.println(
      "[VALIDATION] Temperature out of range."
    );

    return reading;
  }


  if (reading.humidity < HUM_MIN ||
      reading.humidity > HUM_MAX) {

    Serial.println(
      "[VALIDATION] Humidity out of range."
    );

    return reading;
  }


  reading.valid = true;

  return reading;
}


// ============================================================
// PRINT RAW READING
// ============================================================

void printRawReading(
  const SensorReading &reading
) {

  Serial.println();
  Serial.println("[RAW READING]");


  Serial.print("PM2.5: ");
  Serial.print(reading.pm2_5, 2);
  Serial.println(" ug/m3");


  Serial.print("PM10: ");
  Serial.print(reading.pm10, 2);
  Serial.println(" ug/m3");


  Serial.print("Temperature: ");
  Serial.print(reading.temperature, 2);
  Serial.println(" C");


  Serial.print("Humidity: ");
  Serial.print(reading.humidity, 2);
  Serial.println(" %");
}


// ============================================================
// PM2.5 STANDARD DEVIATION
// ============================================================

double calculatePM25StdDev() {

  if (block.sampleCount < 2) {

    return 0.0;
  }


  double mean =
    block.sumPM2_5 /
    block.sampleCount;


  double variance =
    (block.sumPM2_5Squared /
     block.sampleCount)
    - (mean * mean);


  if (variance < 0) {

    variance = 0;
  }


  return sqrt(variance);
}


// ============================================================
// GET TIMESTAMP
// ============================================================

String getTimestamp() {

  time_t now = time(nullptr);


  if (now < 100000) {

    return "1970-01-01T00:00:00+08:00";
  }


  struct tm* timeInfo =
    localtime(&now);


  char timestamp[32];


  snprintf(

    timestamp,
    sizeof(timestamp),

    "%04d-%02d-%02dT%02d:%02d:%02d+08:00",

    timeInfo->tm_year + 1900,
    timeInfo->tm_mon + 1,
    timeInfo->tm_mday,

    timeInfo->tm_hour,
    timeInfo->tm_min,
    timeInfo->tm_sec
  );


  return String(timestamp);
}


// ============================================================
// WIFI
// ============================================================

bool validUploadUrl(const String& value) {
  // This prototype uses the existing local HTTP FastAPI server.
  if (!value.startsWith("http://") || value.length() < 12 || value.length() >= sizeof(SERVER_URL)) return false;
  for (unsigned int i = 0; i < value.length(); ++i) {
    if (value[i] <= 32 || value[i] == '"' || value[i] == '<' || value[i] == '>') return false;
  }
  return true;
}

bool configureNodeWiFi(bool forcePortal) {
  if (!configStorageReady) {
    LittleFS.setConfig(LittleFSConfig(false)); // Never auto-format a failed mount and lose queued readings.
    configStorageReady = LittleFS.begin();
    if (!configStorageReady) {
      Serial.println("[Setup] Cannot mount LittleFS. Queue storage unavailable. For first-time initialization, send f then explicitly confirm FORMAT.");
    }
  }
  if (configStorageReady && LittleFS.exists(SERVER_CONFIG_PATH)) {
    File config = LittleFS.open(SERVER_CONFIG_PATH, "r");
    if (config) {
      String value = config.readString();
      config.close();
      value.trim();
      if (validUploadUrl(value)) value.toCharArray(SERVER_URL, sizeof(SERVER_URL));
    }
  }

  String password = SETUP_AP_PASSWORD;
  if (password == "REPLACE_WITH_PRIVATE_PASSWORD" || password.length() < 8 || password.length() > 63) {
    Serial.println("[Setup] Set a private 8-63 character SETUP_AP_PASSWORD before flashing.");
    return false;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFiManager manager;
  manager.setDebugOutput(false); // Do not print Wi-Fi credentials.
  manager.setShowPassword(false);
  manager.setShowInfoUpdate(false);
  manager.setShowInfoErase(false);
  manager.setConnectTimeout(20);
  manager.setConfigPortalTimeout(180);
  WiFiManagerParameter serverParameter("server", "FastAPI upload URL (http://...)", SERVER_URL, sizeof(SERVER_URL) - 1);
  if (ALLERT_UPLOAD_MODE == 0) manager.addParameter(&serverParameter);
  bool parametersSaved = false;
  manager.setSaveParamsCallback([&parametersSaved]() { parametersSaved = true; });
  manager.setAPCallback([](WiFiManager* portal) {
    Serial.print("[Setup] Join hotspot: ");
    Serial.println(portal->getConfigPortalSSID());
    Serial.println("[Setup] Open http://192.168.4.1 and choose Configure WiFi.");
  });
  String apName = "ALLERT-Setup-" + String(ESP.getChipId(), HEX);
  Serial.printf("[Upload] Mode: %s\n", ALLERT_UPLOAD_MODE == 2 ? "hosted FastAPI HTTPS" :
    (ALLERT_UPLOAD_MODE == 1 ? "Supabase HTTPS" : "local FastAPI HTTP"));
  bool connected = forcePortal
    ? manager.startConfigPortal(apName.c_str(), SETUP_AP_PASSWORD)
    : manager.autoConnect(apName.c_str(), SETUP_AP_PASSWORD);

  if (parametersSaved && ALLERT_UPLOAD_MODE == 0) {
    String value = serverParameter.getValue();
    value.trim();
    if (validUploadUrl(value)) {
      value.toCharArray(SERVER_URL, sizeof(SERVER_URL));
      if (configStorageReady) {
        File config = LittleFS.open(SERVER_CONFIG_PATH, "w");
        if (config) {
          size_t written = config.print(SERVER_URL);
          config.close();
          Serial.println(written == strlen(SERVER_URL)
            ? "[Setup] Upload server saved."
            : "[Setup] Upload server save failed.");
        } else Serial.println("[Setup] Cannot save upload server.");
      }
    } else Serial.println("[Setup] Invalid upload URL. Keeping the previous URL.");
  }

  if (connected && WiFi.status() == WL_CONNECTED) {
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    Serial.print("[WiFi] Connected. Node IP: ");
    Serial.println(WiFi.localIP());
    Serial.println("[NTP] Synchronization requested.");
    return true;
  }
  Serial.println("[WiFi] Not connected. Reopen setup with the setup button (if fitted) or Serial command s.");
  return false;
}

void initWiFi() {
  configureNodeWiFi(false);
  if (ALLERT_SETUP_BUTTON_PIN >= 0) Serial.println("[Setup] Hold the setup button for 3 seconds to change Wi-Fi.");
  Serial.println("[Setup] Serial command s also reopens Wi-Fi setup.");
}

// ============================================================
// PERSISTENT UPLOAD QUEUE
// ============================================================
uint16_t queueCount() {
  uint16_t count = 0;
  Dir dir = LittleFS.openDir("/queue");
  while (dir.next()) if (dir.fileName().endsWith(".json")) count++;
  return count;
}

bool queueReading(double pm25, double pm10, double temperature, double humidity,
                  uint32_t count, double deviation, const char* quality) {
  if (!configStorageReady || !blockEndEpoch || time(nullptr) < 1700000000) {
    Serial.println("[Queue] Storage or synchronized clock unavailable; block could not be saved.");
    return false;
  }
  if (queueCount() >= MAX_QUEUED_BLOCKS) {
    Serial.println("[Queue] Capacity reached (72 hours). This block was not saved. Existing queued blocks remain.");
    return false;
  }
  time_t ended = blockEndEpoch;
  struct tm utc; gmtime_r(&ended, &utc);
  char timestamp[25]; strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  JsonDocument packet;
  packet["device_id"] = ALLERT_DEVICE_ID;
  packet["timestamp"] = timestamp;
  packet["pm2_5"] = round(pm25 * 100.0) / 100.0;
  packet["pm10"] = round(pm10 * 100.0) / 100.0;
  packet["temperature"] = round(temperature * 100.0) / 100.0;
  packet["humidity"] = round(humidity * 100.0) / 100.0;
  packet["sample_count"] = count;
  packet["expected_samples"] = EXPECTED_SAMPLES;
  packet["pm25_stddev"] = round(deviation * 10000.0) / 10000.0;
  packet["data_quality_status"] = quality;
  const String path = "/queue/" + String(blockEndEpoch) + ".json";
  if (LittleFS.exists(path)) {
    Serial.println("[Queue] This block is already saved. It was not overwritten.");
    return false;
  }
  LittleFS.mkdir("/queue");
  File file = LittleFS.open(path + ".tmp", "w");
  if (!file) { Serial.println("[Queue] Cannot create packet."); return false; }
  const size_t expected = measureJson(packet);
  const size_t written = serializeJson(packet, file);
  file.flush(); file.close();
  if (written != expected || !LittleFS.rename(path + ".tmp", path)) {
    LittleFS.remove(path + ".tmp");
    Serial.println("[Queue] Packet save failed."); return false;
  }
  preferredPacket = path;
  Serial.printf("[Queue] Completed block saved. Pending: %u\n", queueCount());
  return true;
}

void processUploadQueue() {
  if (!configStorageReady || WiFi.status() != WL_CONNECTED || time(nullptr) < 1700000000) return;
  const uint32_t now = millis();
  if (!allertElapsed(now, lastUploadAttempt, uploadBackoff)) return;
  lastUploadAttempt = now;
  String path;
  Dir dir = LittleFS.openDir("/queue");
  while (dir.next()) {
    const String entry = dir.fileName();
    const String name = String("/queue/") + String(allertBaseName(entry.c_str()));
    if (name.endsWith(".json") && (path.length() == 0 || name.compareTo(path) < 0)) path = name;
  }
  if (preferredPacket.length() && LittleFS.exists(preferredPacket)) path = preferredPacket;
  if (!path.length()) return;
  File file = LittleFS.open(path, "r");
  if (!file) { Serial.println("[Queue] Cannot read pending packet."); return; }
  if (file.size() > 2048) { file.close(); Serial.println("[Queue] Oversized packet requires review."); return; }
  const String packet = file.readString(); file.close();
  HTTPClient http;
  http.setTimeout(8000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  int code = -1;
  String response;
#if ALLERT_UPLOAD_MODE == 1 || ALLERT_UPLOAD_MODE == 2
  const char* credential = ALLERT_UPLOAD_TOKEN;
  if (!allertDeviceTokenValid(credential)) {
    Serial.println("[Cloud] Set a private 64-hex device upload token before cloud uploads."); return;
  }
#if ALLERT_UPLOAD_MODE == 2
  const char* uploadUrl = ALLERT_HOSTED_API_URL;
#else
  const char* uploadUrl = ALLERT_CLOUD_INGEST_URL;
#endif
  if (!allertHttpsUploadUrlValid(uploadUrl)) {
    Serial.println("[Cloud] Set a valid HTTPS upload URL without credentials, query or fragment."); return;
  }
  BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(&trustAnchor);
  client.setHandshakeTimeout(8);
  if (!http.begin(client, uploadUrl)) return;
  http.addHeader("X-Allert-Device-Token", credential);
#else
  WiFiClient client;
  if (!http.begin(client, SERVER_URL)) return;
#endif
  http.addHeader("Content-Type", "application/json");
  code = http.POST(packet);
  if (code > 0) response = http.getString();
  http.end();
  bool accepted = allertHttpSuccess(code);
#if ALLERT_UPLOAD_MODE == 1 || ALLERT_UPLOAD_MODE == 2
  JsonDocument acknowledgement;
  accepted = accepted && !deserializeJson(acknowledgement, response) && acknowledgement["ok"].is<bool>() && acknowledgement["ok"].as<bool>();
#endif
  if (accepted) {
    if (!LittleFS.remove(path)) Serial.println("[Queue] Could not remove acknowledged packet; retry remains safe in cloud mode.");
    if (path == preferredPacket) preferredPacket = "";
    uploadBackoff = 1000;
    Serial.printf("[Upload] Accepted completed block. Pending: %u\n", queueCount());
  } else if (code == 400 || code == 409 || code == 413) {
    // Preserve rejected packets for review; do not let one bad packet block all later uploads.
    LittleFS.mkdir("/rejected");
    const String rejected = String("/rejected/") + path.substring(path.lastIndexOf('/') + 1);
    if (LittleFS.rename(path, rejected)) Serial.println("[Upload] Packet moved to /rejected for review.");
    else Serial.println("[Upload] Could not preserve rejected packet; pending copy retained.");
    if (path == preferredPacket) preferredPacket = "";
    uploadBackoff = 30000;
  } else {
    uploadBackoff = allertBackoff(uploadBackoff < 30000 ? 30000 : uploadBackoff);
    Serial.printf("[Upload] HTTP %d. Packet retained; retry in %lu seconds.\n", code, (unsigned long)(uploadBackoff / 1000));
  }
}

// ============================================================
// PRINT BLOCK AVERAGE
// ============================================================

void printBlockAverage() {

  Serial.println();
  Serial.println(
    "========================================"
  );

  Serial.println(
    "       5-MINUTE BLOCK AVERAGE"
  );

  Serial.println(
    "========================================"
  );


  // ----------------------------------------------------------
  // No data
  // ----------------------------------------------------------

  if (block.sampleCount == 0) {

    Serial.println(
      "No valid samples in this block."
    );

    Serial.println(
      "========================================"
    );

    return;
  }


  // ----------------------------------------------------------
  // Calculate averages
  // ----------------------------------------------------------

  double avgPM25 =
    block.sumPM2_5 /
    block.sampleCount;


  double avgPM10 =
    block.sumPM10 /
    block.sampleCount;


  double avgTemperature =
    block.sumTemperature /
    block.sampleCount;


  double avgHumidity =
    block.sumHumidity /
    block.sampleCount;


  double pm25StdDev =
    calculatePM25StdDev();


  // ----------------------------------------------------------
  // Data quality
  // ----------------------------------------------------------

  const char* qualityStatus;


  if (
    block.sampleCount <
    MIN_VALID_SAMPLES
  ) {

    qualityStatus = "GAP_FLAGGED";

  } else {

    qualityStatus = "VALID";
  }


  // ----------------------------------------------------------
  // Print
  // ----------------------------------------------------------

  Serial.print("Samples: ");
  Serial.print(block.sampleCount);
  Serial.print(" / ");
  Serial.println(EXPECTED_SAMPLES);


  Serial.print("PM2.5 avg: ");
  Serial.print(avgPM25, 2);
  Serial.println(" ug/m3");


  Serial.print("PM10 avg: ");
  Serial.print(avgPM10, 2);
  Serial.println(" ug/m3");


  Serial.print("Temperature avg: ");
  Serial.print(avgTemperature, 2);
  Serial.println(" C");


  Serial.print("Humidity avg: ");
  Serial.print(avgHumidity, 2);
  Serial.println(" %");


  Serial.print("PM2.5 StdDev: ");
  Serial.println(pm25StdDev, 4);


  Serial.print("Data quality: ");
  Serial.println(qualityStatus);


  // ----------------------------------------------------------
  // Save the completed block; the configured upload mode drains the queue.
  // ----------------------------------------------------------

  bool sent = queueReading(

    avgPM25,
    avgPM10,

    avgTemperature,
    avgHumidity,

    block.sampleCount,
    pm25StdDev,

    qualityStatus
  );


  Serial.println();


  if (sent) {

    Serial.println(
      "[ALLERT] 5-minute block saved for upload."
    );

  } else {

    Serial.println(
      "[ALLERT] 5-minute block could NOT be saved; check clock, storage, and queue capacity."
    );
  }


  Serial.println(
    "========================================"
  );
}


// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);


  Serial.println();
  Serial.println();

  Serial.println(
    "========================================"
  );

  Serial.println(
    "       ALLERT SENSOR NODE"
  );

  Serial.println(
    "       ESP8266 + SPS30 + SHT40"
  );

  Serial.println(
    "========================================"
  );


  // ----------------------------------------------------------
  // I2C
  // ----------------------------------------------------------

  Wire.begin(
    I2C_SDA_PIN,
    I2C_SCL_PIN
  );


  Wire.setClock(100000);


  Serial.println();
  Serial.println(
    "[I2C] Initialized."
  );

  Serial.println(
    "[I2C] SDA = GPIO4 / D2"
  );

  Serial.println(
    "[I2C] SCL = GPIO5 / D1"
  );


  // ----------------------------------------------------------
  // Sensors
  // ----------------------------------------------------------

  initSPS30();

  delay(500);

  initSHT40();


  // ----------------------------------------------------------
  // Block
  // ----------------------------------------------------------

  block.reset();


  // ----------------------------------------------------------
  // Wi-Fi
  // ----------------------------------------------------------

  initWiFi();
  if (configStorageReady) {
    LittleFS.mkdir("/queue"); LittleFS.mkdir("/rejected");
    // Only unfinished temporary writes are removed; completed packets survive reboot.
    Dir pending = LittleFS.openDir("/queue");
    while (pending.next()) {
      const String entry = pending.fileName();
      const String name = String("/queue/") + String(allertBaseName(entry.c_str()));
      if (name.endsWith(".tmp")) LittleFS.remove(name);
      else if (name.endsWith(".json") && name.compareTo(preferredPacket) > 0) preferredPacket = name;
    }
  }
  if (ALLERT_SETUP_BUTTON_PIN >= 0) pinMode(ALLERT_SETUP_BUTTON_PIN, INPUT_PULLUP);


  // ----------------------------------------------------------
  // Timers
  // ----------------------------------------------------------

  lastRawSample = millis();

  lastBlockAverage = millis();


  Serial.println();

  Serial.println(
    "ALLERT sensor node is running."
  );

  Serial.println(
    "Raw sampling interval: 10 seconds"
  );

  Serial.println(
    "Block averaging interval: 5 minutes"
  );

  Serial.println(
    "Expected samples per block: 30"
  );
}


// ============================================================
// LOOP
// ============================================================

void loop() {
  static uint32_t buttonDown = 0;
  static bool buttonLatched = false;
  const char command = Serial.available() ? (char)Serial.read() : 0;
  bool requested = command == 's';
  if (command == 'f') {
    Serial.println("[Storage] Formatting erases queued readings and the saved upload URL.");
    Serial.println("[Storage] Send FORMAT within 15 seconds only if you intend to initialize/erase storage.");
    while (Serial.available()) Serial.read();
    const unsigned long previousTimeout = Serial.getTimeout();
    Serial.setTimeout(15000);
    String confirmation = Serial.readStringUntil('\n'); confirmation.trim();
    Serial.setTimeout(previousTimeout);
    if (confirmation == "FORMAT") {
      LittleFS.end();
      configStorageReady = LittleFS.format() && LittleFS.begin();
      if (configStorageReady) {
        LittleFS.mkdir("/queue"); LittleFS.mkdir("/rejected"); preferredPacket = "";
        Serial.println("[Storage] Initialized. Queue was cleared.");
      } else Serial.println("[Storage] Initialization failed. Check flash layout.");
    } else Serial.println("[Storage] Not formatted.");
    block.reset(); blockCollecting = false; blockEndEpoch = 0;
  }
  if (ALLERT_SETUP_BUTTON_PIN >= 0) {
    if (digitalRead(ALLERT_SETUP_BUTTON_PIN) == LOW) {
      if (!buttonDown) buttonDown = millis();
      if (!buttonLatched && allertElapsed(millis(), buttonDown, 3000)) { requested = true; buttonLatched = true; }
    } else { buttonDown = 0; buttonLatched = false; }
  }
  if (requested) {
    Serial.println("[Setup] Sampling paused. Partial block discarded; queued blocks retained.");
    configureNodeWiFi(true);
    block.reset(); blockCollecting = false; blockEndEpoch = 0;
  }
  static uint32_t lastReconnect = 0;
  if (WiFi.status() != WL_CONNECTED && allertElapsed(millis(), lastReconnect, 30000)) {
    lastReconnect = millis(); WiFi.reconnect();
  }
  static uint32_t lastClockRequest = 0;
  if (WiFi.status() == WL_CONNECTED && time(nullptr) < 1700000000 && allertElapsed(millis(), lastClockRequest, 30000)) {
    lastClockRequest = millis();
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
  }
  const time_t epoch = time(nullptr);
  if (epoch < 1700000000) { delay(5); return; }
  if (!blockEndEpoch) blockEndEpoch = allertNextBlock((uint32_t)epoch);
  if ((uint32_t)epoch + 300U < blockEndEpoch) {
    Serial.println("[Clock] Clock moved backward. Discarding partial block.");
    block.reset(); blockCollecting = false; blockEndEpoch = allertNextBlock((uint32_t)epoch);
  }
  // Wait for a true UTC five-minute boundary before starting the first complete block.
  if ((uint32_t)epoch >= blockEndEpoch) {
    if (blockCollecting) printBlockAverage();
    block.reset();
    blockCollecting = true;
    blockEndEpoch = allertNextBlock((uint32_t)epoch);
    lastRawSample = millis() - RAW_SAMPLE_INTERVAL;
  }
  if (blockCollecting && allertElapsed(millis(), lastRawSample, RAW_SAMPLE_INTERVAL)) {
    lastRawSample = millis();
    const SensorReading reading = readSensors();
    if (reading.valid) { printRawReading(reading); block.add(reading); }
    else Serial.println("[READING] Invalid or incomplete reading.");
  }
  // Prefer transmission immediately after sampling, leaving time before the next raw read.
  // Network stalls can reduce sample_count; these blocks are explicitly GAP_FLAGGED.
  if (!blockCollecting || millis() - lastRawSample < 1000U) processUploadQueue();
  delay(5);
}
