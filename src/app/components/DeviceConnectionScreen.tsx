import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Power,
  Bluetooth,
  Wifi,
  Cloud,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Signal,
  ArrowLeft,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type StepStatus = "pending" | "in_progress" | "done" | "failed";

interface Step {
  number: number;
  label: string;
  description: string;
  status: StepStatus;
}

interface BluetoothDevice {
  id: string;
  name: string;
  signalStrength: number;
}

interface WifiNetwork {
  ssid: string;
  signalStrength: number;
  secured: boolean;
}

export function DeviceConnectionScreen() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<Step[]>([
    { number: 1, label: "Power On Node", description: "Turn on device", status: "in_progress" },
    { number: 2, label: "Bluetooth Pairing", description: "Connect via Bluetooth", status: "pending" },
    { number: 3, label: "Wi-Fi Setup", description: "Configure network", status: "pending" },
    { number: 4, label: "Node Connects to Wi-Fi", description: "Establishing connection", status: "pending" },
    { number: 5, label: "Cloud Sync Active", description: "Syncing with Supabase", status: "pending" },
    { number: 6, label: "Live", description: "Accessible anywhere", status: "pending" },
  ]);

  // Bluetooth state
  const [isScanning, setIsScanning] = useState(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [isPairing, setIsPairing] = useState(false);

  // Wi-Fi state
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
  const [showPasswordSheet, setShowPasswordSheet] = useState(false);
  const [wifiPassword, setWifiPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);

  // Connection state
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [nodeId, setNodeId] = useState("");

  const updateStepStatus = (stepNumber: number, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((step) => (step.number === stepNumber ? { ...step, status } : step))
    );
  };

  const advanceToStep = (stepNumber: number) => {
    setCurrentStep(stepNumber);
    updateStepStatus(stepNumber, "in_progress");
  };

  // Step 1: Power On
  const handleNodePoweredOn = () => {
    updateStepStatus(1, "done");
    advanceToStep(2);
    // Auto-start Bluetooth scan
    setTimeout(() => scanForBluetoothDevices(), 500);
  };

  // Step 2: Bluetooth Scanning
  const scanForBluetoothDevices = () => {
    setIsScanning(true);
    setBluetoothDevices([]);

    // Simulate device discovery
    setTimeout(() => {
      setBluetoothDevices([
        { id: "node-001", name: "ALLERT Node-001", signalStrength: 85 },
        { id: "node-002", name: "ALLERT Node-002", signalStrength: 60 },
        { id: "device-03", name: "Other Device", signalStrength: 45 },
      ]);
      setIsScanning(false);
    }, 2000);
  };

  const handlePairDevice = async (device: BluetoothDevice) => {
    setIsPairing(true);
    setSelectedDevice(device);

    // Simulate pairing
    setTimeout(() => {
      setIsPairing(false);
      updateStepStatus(2, "done");
      advanceToStep(3);
      // Auto-scan for Wi-Fi
      setTimeout(() => scanForWifiNetworks(), 500);
    }, 1500);
  };

  // Step 3: Wi-Fi Setup
  const scanForWifiNetworks = () => {
    // Simulate Wi-Fi scan
    setWifiNetworks([
      { ssid: "Home Network", signalStrength: 90, secured: true },
      { ssid: "Office WiFi", signalStrength: 75, secured: true },
      { ssid: "Guest Network", signalStrength: 50, secured: false },
    ]);
  };

  const handleSelectNetwork = (network: WifiNetwork) => {
    setSelectedNetwork(network);
    setShowPasswordSheet(true);
    setWifiPassword("");
  };

  const handleSendCredentials = async () => {
    if (!selectedNetwork) return;

    setIsSendingCredentials(true);
    setShowPasswordSheet(false);

    // Simulate sending credentials
    setTimeout(() => {
      setIsSendingCredentials(false);
      updateStepStatus(3, "done");
      advanceToStep(4);
      // Auto-start connection
      setTimeout(() => connectToWifi(), 500);
    }, 1500);
  };

  // Step 4: Node Connecting to Wi-Fi
  const connectToWifi = async () => {
    setIsConnecting(true);
    setConnectionError("");

    // Simulate connection attempt
    setTimeout(() => {
      const success = Math.random() > 0.2; // 80% success rate
      setIsConnecting(false);

      if (success) {
        updateStepStatus(4, "done");
        advanceToStep(5);
        // Auto-start cloud sync
        setTimeout(() => startCloudSync(), 500);
      } else {
        setConnectionError("Connection failed. Check your password and try again.");
        updateStepStatus(4, "failed");
      }
    }, 3000);
  };

  const retryConnection = () => {
    setConnectionError("");
    updateStepStatus(4, "in_progress");
    connectToWifi();
  };

  // Step 5: Cloud Sync
  const startCloudSync = () => {
    // Generate node ID
    const id = `NODE-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setNodeId(id);

    // Simulate sync
    setTimeout(() => {
      updateStepStatus(5, "done");
      advanceToStep(6);
    }, 2000);
  };

  const handleComplete = () => {
    // Store node connection in localStorage
    localStorage.setItem("allert_node_connected", "true");
    localStorage.setItem("allert_node_id", nodeId);
    if (selectedNetwork) {
      localStorage.setItem("allert_node_network", selectedNetwork.ssid);
    }
    navigate("/app/settings");
  };

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case "done":
        return "bg-emerald-500";
      case "in_progress":
        return "bg-blue-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-zinc-700";
    }
  };

  const getSignalIcon = (strength: number) => {
    if (strength >= 75) return <Signal className="w-4 h-4 text-emerald-400" />;
    if (strength >= 50) return <Signal className="w-4 h-4 text-yellow-400" />;
    return <Signal className="w-4 h-4 text-orange-400" />;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="w-full max-w-md mx-auto min-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-lg border-b border-zinc-800 px-5 py-3 flex items-center gap-3 z-10">
          <button
            onClick={() => navigate("/app/settings")}
            className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Node Connection</h1>
            <p className="text-xs text-zinc-400">Step {currentStep} of 6</p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Step Progress */}
          <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800">
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.number} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        step.status === "done"
                          ? "bg-emerald-500 text-white"
                          : step.status === "in_progress"
                            ? "bg-blue-500 text-white"
                            : step.status === "failed"
                              ? "bg-red-500 text-white"
                              : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {step.status === "done" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        step.number
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`w-0.5 h-6 ${
                          step.status === "done" ? "bg-emerald-500" : "bg-zinc-800"
                        }`}
                      />
                    )}
                  </div>
                  <div className={step.status === "done" ? "opacity-50" : ""}>
                    <div className="text-xs font-medium">{step.label}</div>
                    <div className="text-[11px] text-zinc-500">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div>
            <AnimatePresence mode="wait">
              {/* Step 1: Power On */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
                      <Power className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Power On Your Node</h2>
                    <p className="text-sm text-zinc-400 mb-5">
                      Turn on your Node device. The LED should begin blinking.
                    </p>
                    <Button
                      onClick={handleNodePoweredOn}
                      className="w-full h-10 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                    >
                      My Node is On
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Bluetooth Pairing */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
                        {isScanning ? (
                          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                        ) : (
                          <Bluetooth className="w-8 h-8 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Bluetooth Pairing</h2>
                        <p className="text-sm text-zinc-400">
                          {isScanning ? "Scanning for devices..." : "Select your Node device"}
                        </p>
                      </div>
                    </div>

                    {isScanning ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="h-16 bg-zinc-800/50 rounded-lg animate-pulse"
                          />
                        ))}
                      </div>
                    ) : bluetoothDevices.length > 0 ? (
                      <div className="space-y-2">
                        {bluetoothDevices.map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Bluetooth className="w-5 h-5 text-blue-400" />
                              <div>
                                <div className="font-medium">{device.name}</div>
                                <div className="text-xs text-zinc-500">Signal: {device.signalStrength}%</div>
                              </div>
                            </div>
                            <Button
                              onClick={() => handlePairDevice(device)}
                              disabled={isPairing}
                              className="bg-blue-500 hover:bg-blue-600"
                            >
                              {isPairing && selectedDevice?.id === device.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Pairing...
                                </>
                              ) : (
                                "Pair"
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-400 mb-4">No devices found</p>
                        <Button onClick={scanForBluetoothDevices} variant="outline">
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Scan
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Wi-Fi Setup */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center">
                        <Wifi className="w-8 h-8 text-purple-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Wi-Fi Setup</h2>
                        <p className="text-sm text-zinc-400">Select your Wi-Fi network</p>
                      </div>
                    </div>

                    {isSendingCredentials ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-3" />
                        <p className="text-zinc-300">Sending credentials to Node...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {wifiNetworks.map((network) => (
                          <button
                            key={network.ssid}
                            onClick={() => handleSelectNetwork(network)}
                            className="w-full flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3">
                              <Wifi className="w-5 h-5 text-purple-400" />
                              <div>
                                <div className="font-medium">{network.ssid}</div>
                                <div className="text-xs text-zinc-500">
                                  {network.secured ? "Secured" : "Open"}
                                </div>
                              </div>
                            </div>
                            {getSignalIcon(network.signalStrength)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Wi-Fi Password Bottom Sheet */}
                  <AnimatePresence>
                    {showPasswordSheet && selectedNetwork && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowPasswordSheet(false)}
                          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        />
                        <motion.div
                          initial={{ y: "100%" }}
                          animate={{ y: 0 }}
                          exit={{ y: "100%" }}
                          transition={{ type: "spring", damping: 30, stiffness: 300 }}
                          className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl shadow-2xl max-w-2xl mx-auto"
                        >
                          <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="text-lg font-bold">Enter Wi-Fi Password</h3>
                              <button
                                onClick={() => setShowPasswordSheet(false)}
                                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-4 mb-6">
                              <div>
                                <Label className="text-sm text-zinc-400 mb-2 block">
                                  Network
                                </Label>
                                <Input
                                  value={selectedNetwork.ssid}
                                  disabled
                                  className="bg-zinc-800/50 border-zinc-700"
                                />
                              </div>

                              <div>
                                <Label className="text-sm text-zinc-400 mb-2 block">
                                  Password
                                </Label>
                                <div className="relative">
                                  <Input
                                    type={showPassword ? "text" : "password"}
                                    value={wifiPassword}
                                    onChange={(e) => setWifiPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className="bg-zinc-800/50 border-zinc-700 pr-12"
                                  />
                                  <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="w-5 h-5" />
                                    ) : (
                                      <Eye className="w-5 h-5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <Button
                              onClick={handleSendCredentials}
                              disabled={!wifiPassword}
                              className="w-full h-12 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                            >
                              Send to Node
                            </Button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Step 4: Node Connecting to Wi-Fi */}
              {currentStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-zinc-900/50 rounded-2xl p-8 border border-zinc-800 text-center">
                    {isConnecting ? (
                      <>
                        <div className="relative w-32 h-32 mx-auto mb-6">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-xl"
                          />
                          <div className="relative w-full h-full bg-zinc-900 rounded-full flex items-center justify-center border-2 border-purple-500">
                            <Wifi className="w-12 h-12 text-purple-400" />
                          </div>
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Connecting to Wi-Fi</h2>
                        <p className="text-zinc-400 mb-2">
                          Your Node is connecting to{" "}
                          <span className="text-white font-medium">{selectedNetwork?.ssid}</span>
                        </p>
                        <p className="text-sm text-zinc-500">
                          This usually takes 10–30 seconds
                        </p>
                      </>
                    ) : connectionError ? (
                      <>
                        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Connection Failed</h2>
                        <p className="text-zinc-400 mb-6">{connectionError}</p>
                        <div className="flex gap-3">
                          <Button
                            onClick={retryConnection}
                            className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry
                          </Button>
                          <Button
                            onClick={() => {
                              setConnectionError("");
                              advanceToStep(3);
                            }}
                            variant="outline"
                            className="flex-1"
                          >
                            Change Network
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </motion.div>
              )}

              {/* Step 5: Cloud Sync Active */}
              {currentStep === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-zinc-900/50 rounded-2xl p-8 border border-zinc-800 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-12 h-12 text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold mb-6">Cloud Sync Active</h2>

                    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3 mb-6 text-left">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-400">Node ID</span>
                        <span className="font-mono text-sm font-medium">{nodeId}</span>
                      </div>
                      <div className="h-px bg-zinc-700" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-400">Wi-Fi Network</span>
                        <span className="text-sm font-medium">{selectedNetwork?.ssid}</span>
                      </div>
                      <div className="h-px bg-zinc-700" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-400">Cloud Status</span>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          <span className="text-sm text-emerald-400">Syncing</span>
                        </div>
                      </div>
                      <div className="h-px bg-zinc-700" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-400">Last Synced</span>
                        <span className="text-sm">Just now</span>
                      </div>
                    </div>

                    <p className="text-zinc-400 text-sm mb-6">
                      Your Node is now syncing data. You can close this screen.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Step 6: Live */}
              {currentStep === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-gradient-to-br from-emerald-950 to-zinc-900 rounded-2xl p-8 border border-emerald-500/30">
                    <div className="flex items-center gap-3 mb-6">
                      <Cloud className="w-8 h-8 text-emerald-400" />
                      <div>
                        <h2 className="text-2xl font-bold">Live & Connected</h2>
                        <p className="text-sm text-emerald-400">Accessible anywhere</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 rounded-xl p-4 space-y-3 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{nodeId}</span>
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                          Connected
                        </span>
                      </div>
                      <div className="text-sm text-zinc-400">
                        Network: {selectedNetwork?.ssid}
                      </div>
                      <div className="text-xs text-zinc-500">
                        Last data received: Just now
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => navigate("/app/dashboard")}
                        className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600"
                      >
                        View Live Data
                        <ChevronRight className="w-5 h-5 ml-2" />
                      </Button>
                      <Button onClick={handleComplete} variant="outline" className="flex-1">
                        Done
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
