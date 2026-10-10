# ALLERT cloud deployment: next steps

Latest status, October 11, 2026: the cloud model runtime is deployed on Render Free at https://allert-model.onrender.com, from private repository https://github.com/mawii0/allert-model, commit `7074ab6`. Build and startup replay passed; all 12 external cloud forecast cases, private readiness authorization and the current-indicator example passed. The Vercel app and Supabase bridge now serve a historical snapshot computed by this cloud service. Real device telemetry and continuous job processing are still pending; hardware is not ready. The steps below remain a setup/reference guide.

## 1. Your current step: sign in to Render

Open https://dashboard.render.com and sign in or create an account. GitHub sign-in is convenient. Do not create a service or select a paid plan yet. Tell me when the dashboard is visible.

## 2. Put the clean package in a private GitHub repository

We will connect your GitHub account and upload only the clean package contents. Do not upload the whole workspace: it contains local environments and an ignored deployment folder with private credentials. Do not upload the ZIP as the only repository file; Render needs its extracted source files.

The repository root must contain `Dockerfile`, `.dockerignore`, `Allert-main/` and `model/`. The model package retains all 76 manifest-listed files plus its manifest. No model weights, calibration or scalers were changed.

## 3. Create the Render model service

After repository access is ready, use these settings:

| Field | Value |
|---|---|
| Service type | Web Service |
| Repository | The private repository containing the clean model package |
| Name | allert-model (or a unique variation if unavailable) |
| Language | Docker |
| Root directory | Leave blank when the package is at repository root |
| Dockerfile path | Dockerfile |
| Docker build context | Repository root (`.`) |
| Docker command override | Leave blank; use the included CMD |
| Health check path | /health |
| Environment | ALLERT_API_TOKEN: a private random token; ALLERT_DEVICE: cpu; ALLERT_CPU_THREADS: 2 |

The service reads Render's PORT automatically. The API token must be at least 32 characters and belongs only in private backend settings. I will prepare it without posting it in chat. No Supabase service-role key is required by this inference-only service.

Render supports Dockerfile builds from a linked repository. [Official Docker instructions](https://render.com/docs/docker).

Choose the compute plan together after checking the displayed price and memory allowance. Free web services can be useful for an initial demonstration but sleep after 15 idle minutes and have other limits; they are unsuitable for continuous production processing. Do not assume the PyTorch service fits a small plan until its cloud memory and startup checks pass. [Free service limits](https://render.com/docs/free).

## 4. Verify the cloud model

The image runs manifest verification and all 12 golden cases while building. Startup repeats the golden replay and rejects a missing private token before accepting requests. The Docker image has not been built locally because Docker is not installed; the actual cloud build must pass.

Share the resulting public service URL (for example https://allert-model-xxxx.onrender.com). Do not share its secret token. I will verify protected readiness, model/checkpoint identity, all six forecast values, units and target intervals. A 200 from /health alone is insufficient.

## 5. Connect cloud computation to the existing app

The prepared `integration/publish_from_cloud.py` adapter calls protected cloud readiness, forecast and risk endpoints, then publishes the result to the existing Supabase bridge. I will use it to replace the historical snapshot with one computed on the actual cloud host and verify authorized app reads again.

This adapter is one-shot. Continuous device ingestion, durable jobs, chronological detector-state persistence and notifications still require the worker/database integration. The hardware is not ready yet. Keep the app labeled historical replay until genuine valid node telemetry is connected; no fabricated live input or shifted fixture dates.

## Responsibility split

I handle source packaging, model verification, backend wiring, deployment diagnostics and result comparisons. You handle your account sign-in, GitHub/Render account permission prompts and any explicit plan/billing selection. We complete one external step at a time.
