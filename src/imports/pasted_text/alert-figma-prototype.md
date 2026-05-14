Gemini said
To create a comprehensive Figma prototype for the ALLERT system, you should structure it as a multi-page mobile application that balances raw data visualization with clinical utility. Each page must serve a specific role in your thesis’s Input-Process-Output framework.

1. Global Navigation & Information Architecture
Your Figma project should be organized into these five core "Top-Level" views:

Splash & Onboarding: Entry and baseline configuration.

Predictive Dashboard (Home): Real-time monitoring and forecasting.

Environmental Analytics: Deep-dive sensor data and anomalies.

Clinical Health Suite: Symptom logging and correlation trends.

Settings & Profile: User baselines and system health.

2. Page-by-Page Content Breakdown
Page 1: Smart Onboarding & Baseline Setup
This is the "Input" gate for your epidemiological engine.

Demographic Toggle: A high-visibility switch between Adult (Baseline: 0.20) and Pediatric (Baseline: 0.22).

Allergy Profile: Checkboxes for known triggers (Dust Mites, Grass Pollen, etc.) which act as metadata for future correlation analysis.

Permissions Request: Mockups for Location Services (to map to the nearest sensing node) and Push Notifications for the Anomaly Sentinel.

Page 2: The Predictive Dashboard (The "Home" Page)
The primary interface for daily preventive management.

Dynamic Background: The entire screen background should utilize a subtle gradient based on the current tier (e.g., a soft green-to-blue for Low, or a pulsing orange-to-red for Very High).

Risk Gauges: A large circular dial in the top third displaying the Absolute Risk Probability (P 
risk
​
 ).

Forecast Slider: A horizontal timeline component allowing users to tap Now, 6h, 12h, and 24h.

Interaction: Tapping a future time should trigger a "Calculating..." micro-animation followed by the dial updating to the LSTM's predicted risk.

Preventive Guidance Card: A text-based box that provides tier-specific ARIA recommendations (e.g., "High Risk: Wear an N95 mask outdoors").

Page 3: Environmental Deep-Dive (The "Process" View)
This page proves the "IoT" and "Anomaly Detection" components of your thesis.

Live Telemetry Cards: Dedicated cards for PM 
2.5
​
 , PM 
10
​
 , Temperature, and Humidity.

Content: Current value, unit (μg/m 
3
  or  
∘
 C), and a small "Trend Arrow" (Rising/Stable/Falling).

Anomaly Alert Banner: A hidden component that only appears when Z>3.0. It should state: "Localized Surge Detected: Actual PM levels exceed predicted baseline by [X]%."

Historical Sparklines: Simple 24-hour line graphs showing the movement of pollutants, helping users see the "Accumulation Patterns" mentioned in your methodology.

Page 4: Clinical Suite & Validation (The "Output" View)
This page manages the "Human-in-the-loop" clinical ground truth.

The Daily VAS Slider: A 0–10 horizontal slider (Visual Analog Scale). As users move the slider, a face emoji should change from "Happy/Clear" to "Distressed/Congested."

Symptom Checklist (TNSS): Four multi-select chips: Sneezing, Itchy Nose, Runny Nose, and Congestion.

Spearman’s Correlation Graph: A sophisticated dual-axis chart.

Line A (Blue): Predicted Absolute Risk.

Line B (Yellow Dots): User-reported Symptom Scores.

Purpose: This visually demonstrates the "Clinical Validation" of your system.

Page 5: System Status & Profile
Ensures technical transparency for the user.

Sensor Node Status: Displays "Node ID: Iloilo-01," "Uptime: 99.8%," and "Last Sync: 2 minutes ago."

Algorithm Version: Notifies the user of the current LSTM model version (e.g., v2.4.1), maintaining the "Research-grade" feel of the app.

3. High-Fidelity Prototype Interactions (Figma "Magic")
Component	Transition Type	Description
Risk Dial	Smart Animate	The dial needle or fill should rotate smoothly when the user toggles between different forecast horizons.
Anomaly Warning	Overlay (Push)	Set this as a "Top Overlay" that slides down with a "Spring" animation to simulate an urgent system interrupt.
VAS Slider	Drag Gesture	Use a "Drag" trigger to update the number display in real-time as the user slides from 0 to 10.
Correlation Chart	Dissolve	When toggling between "Daily" and "Weekly" views, use a slow dissolve to make the data change feel professional and academic.
4. Visual Assets & UI Kit Recommendations
Shadows: Use soft "Soft Shadows" (Blur: 15, Y: 10, Opacity: 5%) to give the cards a modern, layered look.

Gradients: Use "Glassmorphism" (background blur) for the Anomaly Alert banner to make it look like a high-tech system override.

Units: Always display units (PM 
2.5
​
 μg/m 
3
 ) in a smaller, lighter font weight than the main number to maintain technical clarity.
