# Start here

1. Read `SELECTION_NOTE.md` and `MODEL_CARD.md` to confirm seed 7 / epoch 15 / 35 epochs.
2. Set up a separate Python 3.12 environment using `01_SETUP.md`; install PyTorch and pinned requirements.
3. Run hash verification, CPU self-test and runtime/API tests. Check CUDA on the host if that is its execution path.
4. Read `02_API_CONTRACT.md` and `03_SUPABASE_AND_PWA.md`. The model, indicator and observed detector have independent outputs.
5. Give `APP_COAUTHOR_PROMPT.md` plus this ZIP to the app partner. SQL and TypeScript need actual-repository adaptation and staging tests.
6. Use `04_ACCEPTANCE.md` before approving integration. A successful local test is not a production deployment.

The model is already packaged. Neither Kubernetes nor a training run is required for inference. Someone must run/host the Python worker; the PWA does not execute PyTorch. No service credentials are included. Do not send this handoff's historical fixtures to real push subscribers.
