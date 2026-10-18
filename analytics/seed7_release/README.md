# ALLERT app handoff — seed 7 / epoch 15

Start at `00_START_HERE.md`. **Trained weights are included** in `bundle/model/best_model.pt`, along with their exact scalers, calibration, configuration and result records. The release ID is `median-residual-seed7-epoch15-20261013-v1`.

This is one researcher-selected revised-data BiLSTM, not the old seed-42 single run or the ensemble. It also includes the independent current environmental indicator and observed-PM alert calculation. No CUSUM or neural spike head is active. App coauthor: copy `APP_COAUTHOR_PROMPT.md` into the session containing your actual PWA repository.

The companion Chapter 4 ZIP contains this model's complete training curve, paired ARIMA comparison, own forecasts, tables and an executed results-evidence notebook. The original master notebook is not overwritten.

No real secrets, virtual environment, full training dataset, optimizer checkpoints, host deployment or completed Supabase worker are shipped. The runtime is ready for local verification; SQL/TypeScript are integration templates. Read `SELECTION_NOTE.md` before scientific reporting.
