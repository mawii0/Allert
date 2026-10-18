#pragma once
#include <stdint.h>
// Unsigned subtraction remains valid across millis() wrap-around.
inline bool allertElapsed(uint32_t now, uint32_t last, uint32_t interval) { return (uint32_t)(now-last) >= interval; }
inline uint32_t allertNextBlock(uint32_t epoch) { return (epoch / 300U + 1U) * 300U; }
inline uint32_t allertBackoff(uint32_t previous) { return previous >= 150000U ? 300000U : previous * 2U; }
inline const char* allertBaseName(const char* path) {
  if (!path) return "";
  const char* base = path;
  for (const char* p = path; *p; ++p) if (*p == '/') base = p + 1;
  return base;
}

// Only authenticated HTTPS transports may carry a physical node credential.
inline bool allertDeviceTokenValid(const char* token) {
  if (!token) return false;
  unsigned int length = 0;
  for (; token[length]; ++length) {
    const char c = token[length];
    if (length >= 64 || !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
  }
  return length == 64;
}
inline bool allertHttpsUploadUrlValid(const char* url) {
  const char prefix[] = "https://";
  if (!url) return false;
  for (unsigned int i = 0; i < 8; ++i) if (!url[i] || url[i] != prefix[i]) return false;
  unsigned int hostLength = 0;
  bool path = false;
  for (const char* p = url + 8; *p; ++p) {
    const unsigned char c = *p;
    if (c <= 32 || c >= 127 || c == '@' || c == '?' || c == '#' || c == '\\') return false;
    if (!path && c == '/') path = true;
    if (!path) {
      if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-')) return false;
      ++hostLength;
    }
  }
  return hostLength > 0;
}
inline bool allertHttpSuccess(int status) { return status >= 200 && status < 300; }
