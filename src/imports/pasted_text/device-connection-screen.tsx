Design and implement a "Device Connection" settings screen in our mobile app (iOS/Android) that guides users through connecting a physical Node device to their phone via Bluetooth and Wi-Fi, with real-time cloud sync through Supabase.

---

## SCREEN CONTEXT
This is a full settings sub-screen titled "Node Connection" accessible from the main Settings page. It is not a modal. It should follow our existing app design system (standard nav bar, bottom safe area).

---

## OVERALL FLOW — 6 STEPS (render as a vertical step-progress indicator on the screen)

Step 1 — Power On Node
Step 2 — Bluetooth Pairing
Step 3 — Wi-Fi Setup
Step 4 — Node Connects to Wi-Fi
Step 5 — Cloud Sync Active
Step 6 — Live (Accessible Anywhere)

Each step should have:
- A step number indicator (circle with number)
- A short label and one-line description
- A status badge: Pending / In Progress / Done / Failed
- Active step is highlighted, completed steps are dimmed with a checkmark, future steps are grayed out

---

## STEP-BY-STEP SCREEN STATES

### State 1 — "Power On Node"
- Illustration or icon of a hardware node device with a power button
- Instruction text: "Turn on your Node device. The LED should begin blinking."
- Primary CTA button: "My Node is On →"
- The app waits for user confirmation before proceeding

### State 2 — "Bluetooth Pairing"
- Bluetooth scanning animation (pulsing rings around a device icon)
- List of discovered Bluetooth devices (show a shimmer/skeleton loader while scanning)
- Each device row: device name, signal strength icon, "Pair" button
- On tap "Pair": show a connecting spinner, then success state
- Error state: "No devices found" with a "Retry Scan" button
- Status badge updates to "In Progress" then "Done" on success

### State 3 — "Wi-Fi Setup"
- This step only appears after Bluetooth pairing is successful
- Show a Wi-Fi network picker list: scan for nearby SSIDs, show signal bars per network
- User selects a network → a bottom sheet slides up with:
  - Network name (pre-filled, read-only)
  - Password input field (masked, with show/hide toggle)
  - "Send to Node" primary button
- The app sends Wi-Fi credentials to the Node over Bluetooth
- Loading state: "Sending credentials to Node…" with a progress indicator
- On success: show "Credentials sent!" confirmation inline

### State 4 — "Node Connecting to Wi-Fi"
- Full-screen waiting state with animated connection graphic (Node → Wi-Fi router → cloud)
- Subtitle: "Your Node is connecting to [Network Name]…"
- Estimated time indicator: "This usually takes 10–30 seconds"
- App polls the Node over Bluetooth to check connection status
- On success: auto-advance to Step 5
- On failure: show error card with "Connection failed. Check your password and try again." + "Retry" and "Change Network" buttons

### State 5 — "Cloud Sync Active"
- Show a success animation (checkmark or pulse)
- Card showing:
  - Node ID (masked, e.g. NODE-XXXX-1234)
  - Connected Wi-Fi network name
  - Cloud sync status: "Sending data to Supabase" with a live green dot
  - Last sync timestamp: "Last synced: just now"
- Instruction: "Your Node is now syncing data. You can close this screen."
- Button: "Done" (returns to Settings home)

### State 6 — "Live — Accessible Anywhere" (Persistent Status Card in Settings)
- After full setup, replace the "Node Connection" entry in Settings with a persistent status card:
  - Device name + green "Connected" badge
  - Current Wi-Fi network
  - Last data received timestamp
  - "View Live Data →" button (navigates to dashboard)
  - "Disconnect Node" secondary destructive button (with confirmation dialog)

---

## UI & COMPONENT SPECS

- Step progress: vertical stepper on the left rail, content on the right
- Use skeleton loaders for all async list states (device list, Wi-Fi list)
- All async operations must have: loading → success → error states
- Error states use a red inline banner with an icon, short message, and action button
- Animations: Bluetooth scan = pulsing rings (CSS or Lottie); connecting = dashed line animation between node → router → cloud icons; success = scale-in checkmark
- Bottom sheet for Wi-Fi password: handle keyboard avoidance, dismiss on outside tap
- Use haptic feedback triggers on: pairing success, Wi-Fi send success, sync confirmed

---

## COMPONENT REUSE

Reuse from our existing design system:
- Primary button (filled)
- Secondary button (outlined)
- Destructive button (red, outlined)
- Input field with label + helper text
- Bottom sheet component
- Toast / snackbar for quick confirmations
- Status badge (Pending / Active / Done / Error)
- List row with trailing action

---

## ACCESSIBILITY

- All icons must have accessible labels
- Password field must support screen reader "show/hide password" toggle
- Step indicators must announce state changes to screen readers
- Minimum tap target: 44×44pt

---

## EDGE CASES TO DESIGN

- Bluetooth is off on phone → show prompt to enable Bluetooth with a system settings deep link
- Location permission not granted (required for Wi-Fi scan on Android) → permission request screen
- Node already connected (returning user) → skip to Step 5 state and show current status
- Node goes offline after connection → show "Node Offline" warning card in Settings with last seen time
- Multiple Nodes → allow pairing multiple devices, show a list in Settings