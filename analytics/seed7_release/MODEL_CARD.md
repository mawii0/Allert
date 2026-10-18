# Selected 48-hour median-residual BiLSTM

Model ID `median-residual-seed7-epoch15-20261013-v1`; seed **7**; best checkpoint **15**; completed epochs **35**. Weight SHA256 `4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4`. Researcher-selected after review; not the predeclared minimum-loss winner. Read `SELECTION_NOTE.md`.

## Architecture and forecast definition

Input is 576 five-minute observations × eight ordered features: PM2.5, PM10, temperature, humidity, trailing 1h temperature/humidity means, trailing 6h temperature/humidity means. Fetch 648 contiguous observations (54h) for rolling-feature warmup; the network lookback remains 48h. The training-only RobustScaler and identity target scaler are frozen. Two bidirectional LSTM layers have 64 and 96 units per direction, each with LayerNorm and explicit dropout 0.43. Temporal attention is 192→64→1, tanh then time-axis softmax, with a 192-vector context. Three linear 192→2 heads yield six original-unit residuals. There are 225,671 parameters and no spike head. Dropout is off at inference. The inherited recurrent_dropout value is not applied by this PyTorch implementation; inherited generic preprocessing/feature/split options are not the actual fixed protocol.

`forecast = previous-hour PM median + saved multiplier × learned residual`

Output order: PM2.5/PM10 6h, PM2.5/PM10 12h, PM2.5/PM10 24h. Multipliers: `[0.025, 0.025, 0.025, 0.025, 0.225, 0.15000000000000002]`. These scale a residual, not weights between independent level models. Each output is a five-minute concentration target `[origin+h−5min,origin+h)`, not a whole-horizon average, maximum, dense path or allergy probability. All six neural corrections are nonzero but strongly shrunk.

## Training and chronological roles

CUDA/AMP training from scratch; Adam; batch16; LR0.000363; weighted Huber/SmoothL1 weights0.5/0.3/0.2; manual L2 9.46e-6; gradient clip0.5; cosine100 schedule; max100/patience20. Optimization uses Huber+L2, but selection and the logged `loss`/`val_loss` curves use Huber ALONE. No augmentation. `bundle/protocol.json` contains exact fixed chronological blocks: 7,767 training, 461 stopping, 385 earlier calibration, 480 development, 1,614 later assessment origins. Timezone is Asia/Manila for naive research times. Source Node1 SHA256 `71dcd02d1c5fa77b35cc362982454ddec6295c1ed4a717c4dab84bdf5e68c6cf`.

Epoch1 stopping Huber 2.1688848692795326; best 2.110111390722209; improvement 2.709848%. All20 subsequent epochs were worse than the selected minimum; final loss 2.374848957719474. The comparable untrained stopping loss was2.0937826222386855, lower than the best trained loss; it is a diagnostic, not an eligible trained checkpoint. Epoch15 is not evidence alone that the model is free of overfitting or period shift.

## Matched results and limits

Own calibrated development macro MAE3.272482, RMSE4.222738 µg/m³, MAPE15.259534%, mean output R²0.139190. Own later September macro MAE4.336537, RMSE6.205049 µg/m³, MAPE26.863267%, mean output R²0.210008. Shared causal ARIMA(2,1,2) later MAE4.416832, RMSE6.280434. Baseline and neural metrics use the same six outputs and origins; these are descriptive small differences, not significance claims. Full JSON/arrays in `bundle/` retain precise values. Both assessment periods had been reviewed; no independent confirmation is claimed.

Development 24h R² is negative for both pollutants. Later12/24h R² is weak. The later diagnostic actual>anchor+5 subsets underpredict100% (n161,173,234,245,208,229). Overall near-zero bias does not establish reliable unexpected-spike forecasts. The strongly shrunk median-residual system must not be described as an unaided level-predicting BiLSTM or as “73.14% accurate” from MAPE. Nodes2/3 forecast transfer and uncertainty intervals are not validated.

## Separate app analytics

The supplied current environmental indicator coefficients/tier boundaries and observed-PM detector policy are unchanged. Indicator points are not AQI or individual symptom probability. Observed alerts detect CURRENT rise/high PM, not guaranteed future smoke/fire; their returned notice decisions are not delivered notifications. No CUSUM is active. Operational hosting, database state/transactional worker, PWA integration and push delivery remain coauthor tasks.
