# Reminiscence Photo Persistence â€” Readiness Report

## Status

The local implementation now supports private photo upload, owner-scoped retrieval, retry, text-only fallback, and photo deletion compensation for Photo Memories, My Life Book, Good Deeds, Revisit My Memories, and the revealed portion of Memory Conversation.

The implementation is **not ready for real shared Supabase photo writes yet**. Read-only catalog inspection found no Storage buckets or Storage policies. No photo was uploaded, no participant/application record was read or written, and no migration was run. The app will return a clear photo-storage-not-configured response until backend storage settings are supplied and the private bucket is approved and provisioned.

## Confirmed root cause

- The three photo entry screens kept only the image picker URI in local React state.
- The text-entry screens called the existing JSON endpoint, which had no image field.
- `reminiscenceMemoryController.createEntry` explicitly saved `photo_reference` as `null`.
- The local migration defines `reminiscence_memory_entries.photo_reference`; read-only inspection confirmed the shared column is present.

Previously selected device-only images are not recoverable by this code. The user must choose those images again to attach them to an entry.

## Local implementation

- New backend service validates JPEG/PNG/WebP signatures and an 8 MiB cap, creates owner-prefixed object keys, uploads through the backend, issues 10-minute signed links, downloads for delete compensation, and deletes private objects. The service-role key is read only from backend environment variables and is never returned to the mobile client.
- New authenticated multipart endpoint saves a photo with its memory record. The same request ID can safely retry an already uploaded image without creating a duplicate row.
- Existing text-only save behavior remains available. Photo screens now ask whether to save the photo privately, save the text only, or cancel. Upload failures offer Retry and Save text only.
- Entry-list responses replace the private object key with a short-lived signed URL and a missing-photo indicator. A separate owner-checked endpoint refreshes an expired URL. The raw storage key is not sent to the mobile app.
- Revisit My Memories displays the picture only with the saved entry; Memory Conversation continues hiding the story and picture until the existing **Remind me** action.
- Deleting an entry deletes its photo first, then the row. If the database delete fails, the backend attempts to restore the image. Storage and PostgreSQL cannot share one transaction, so a recovery failure still requires operator review.
- Text-only entries and missing photos remain usable; unavailable photos show a calm placeholder.

## Current storage and database capability (read-only inspection, 14 Oct 2026)

- Local code contains no Supabase Storage client or bucket/policy setup code. The backend uses its existing authenticated API boundary for photo operations.
- At audit time, no storage-specific `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_REMINISCENCE_BUCKET` configuration was found. The values of other environment variables were not printed.
- The authorized read-only `SELECT 1` check succeeded against the configured Supabase database through the existing pooler on port 6543. No participant rows were queried.
- `storage.buckets` is present and returned **zero buckets**. Its SELECT privilege was confirmed, and the connected database role has `BYPASSRLS`, so row-level security did not hide bucket rows.
- `storage.objects` is present with RLS enabled. `pg_policies` returned **zero policies** for both `storage.buckets` and `storage.objects`.
- The shared `public.reminiscence_memory_entries` table contains `photo_reference VARCHAR(255) NULL`; no schema change is needed for this implementation.
- No remote bucket, policy, schema, or application data was changed.

## Shared Supabase setup status

1. The private `eldermeds-reminiscence-private` bucket is now present with public access disabled, an 8 MiB maximum, and allowed MIME types `image/jpeg`, `image/png`, and `image/webp`.
2. No anonymous or mobile-user Storage policies exist. The backend uses a server-only service role, authenticates callers with existing JWT middleware, and checks canonical owner object paths before Storage operations. The service role bypasses Storage RLS; never place the key in the app bundle.
3. `SUPABASE_URL` and `SUPABASE_REMINISCENCE_BUCKET` are configured in the ignored backend `.env`; `SUPABASE_SERVICE_ROLE_KEY` is still missing.
4. The existing `photo_reference VARCHAR(255)` column is compatible; no schema operation or migration is required.
5. Obtain separate approval before creating any test memory/photo records in the shared project.

## Potential impact on other group components

No other component is changed by this implementation or by the read-only inspection. A dedicated bucket keeps normal photo operations separate from other components’ buckets. However, the required Supabase service-role key is project-wide and bypasses Storage RLS; if exposed or misused, it could access other project Storage data. Keep it only in the backend secret store, restrict the photo routes to the existing authenticated owner checks, and never include it in the mobile app.

## Files changed for this implementation

- `backend/src/services/reminiscencePhotoStorageService.js` â€” private Storage REST operations and byte/key validation.
- `backend/src/controllers/reminiscenceMemoryController.js` â€” photo save, signed-link, listing, and deletion handling.
- `backend/src/repositories/reminiscenceMemoryEntryRepository.js` â€” owner-scoped entry lookup and idempotency lookup.
- `backend/src/routes/emotionalSupportRoutes.js` â€” authenticated, size-limited multipart and signed-link routes.
- `backend/tests/unit/services/reminiscencePhotoStorageService.test.js` â€” storage validation/URL/upload tests.
- `backend/tests/unit/controllers/reminiscenceEntriesController.test.js` â€” controller consent, ownership, retry, response privacy, and delete recovery tests.
- `backend/tests/integration/systemRoutes.integration.test.js`, `backend/tests/e2e/systemJourney.e2e.test.js` â€” route mocks updated for new handlers.
- `frontend/src/features/emotionalSupport/api/emotionalSupportApi.js` â€” multipart upload and signed-link refresh API calls.
- `frontend/src/features/emotionalSupport/components/PrivateMemoryPhoto.js` â€” safe display, refresh, and unavailable state.
- `frontend/src/features/emotionalSupport/screens/PhotoMemoryScreen.js`, `MyLifeBookScreen.js`, `GoodDeedsScreen.js` â€” opt-in persistent photo save and fallback choices.
- `frontend/src/features/emotionalSupport/screens/RevisitMemoriesScreen.js`, `MemoryConversationScreen.js` â€” private photo display while preserving the Remind Me gate.
- `frontend/src/features/emotionalSupport/screens/__tests__/photoReminiscence.test.cjs`, `lifeBookAndGoodDeeds.test.cjs` â€” updated local regressions.

The workspace had unrelated existing changes before this task; those were preserved.

## Tests and checks

- Full frontend Jest suite: **11 suites passed, 89 tests passed**; the final focused rerun passed 15 tests after adding one signed-link-expiry assertion.
- Full backend Jest suite: **34 suites passed, 404 tests passed**; the final focused rerun passed 23 tests after the last upload-failure and compensation assertions.
- Focused backend storage/controller tests: **2 suites passed, 23 tests passed**.
- Focused frontend reminiscence tests: **2 suites passed, 15 tests passed**.
- JSX/JavaScript parse check: **7 changed frontend files parsed successfully**.
- `node --check`: modified backend service, controller, routes, repository, and new storage test parsed successfully.
- `git diff --check`: exit code 0; Git printed only existing LF/CRLF normalization warnings.
- Storage tests use a mocked `fetch`; controller tests mock the repository and Storage service. These are not live Supabase integration tests.
- No Android device visual test or real storage upload/retrieval was performed.

## Manual Android verification after approval/configuration

1. Start the backend with the three backend-only storage settings configured and confirm the existing authenticated API health check responds. Do not run migrations.
2. On the Android app, sign into an authorized development/test account and open **Remember Something Nice â†’ My Photo Memories**.
3. Pick one test image, enter a title and short story, choose **Save photo and story**, and confirm the save success message appears only after the server responds successfully.
4. Open **My Life Book** and confirm the entry and image appear. Repeat using **Good Deeds & Proud Moments**.
5. Open **Revisit My Memories** and confirm only the signed-in accountâ€™s entries and corresponding images appear.
6. Open a memory conversation. Confirm the title/story/image remain hidden before **Remind me** and the matching image appears after reveal. Try **Skip**, **Change topic**, **Finish for now**, and return navigation.
7. Test a text-only entry, cancel photo consent, and choose a deliberately oversized or unsupported file. Confirm text-only saving remains available and invalid images are rejected without a false success message.
8. Leave a revisit screen open until a signed URL expires (10 minutes), then confirm the app refreshes it. If the image was removed, confirm the placeholder appears without breaking the story.
9. Delete a photo entry and verify its image no longer loads. Confirm another account cannot retrieve the image by opening its signed-link API route with a different account token.

## Remaining blockers

- Approval and provisioning of the private shared bucket.
- Backend-only Storage credentials and bucket name supplied through the deployment environment.
- Real backend-to-Supabase photo integration and Android testing after the above prerequisites.

Do not claim persistent photo saving works on the shared project until those checks pass.

## Follow-up infrastructure authorization and status (14 Oct 2026)

The user approved creating the private bucket and configuring the three backend-only Storage variables, but only if authorized Supabase project permissions are available. At that audit time, no management channel was available, so **no remote resource was changed by this workspace**. The previously authorized read-only database connectivity check succeeded.

Before service-role use, the local implementation was tightened to fail closed: configuration accepts only `eldermeds-reminiscence-private`, and object operations accept only the authenticated owner's canonical UUID photo path with a supported image extension. The authenticated reminiscence routes and owner-scoped repository queries were confirmed. Generated paths use a maximum 32-bit database user ID, UUID v4, and `.webp` suffix; the longest path is **52 characters**, below `photo_reference VARCHAR(255)`. No photo or memory record was created, changed, or deleted.

Focused local tests after the guard changes: **2 suites passed, 24 tests passed**. These use mocked Storage fetches and do not establish live Storage access.

The exact backend-only variable names are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_REMINISCENCE_BUCKET`; no secret values are recorded here. Separate approval is still required before any photo or memory test-data write.

## Follow-up verification after manual bucket creation (14 Oct 2026)

- Read-only query of `storage.buckets` confirmed the bucket exists, `public=false`, the limit is 8,388,608 bytes, and MIME types are exactly JPEG, PNG, and WebP. It has zero Storage policies, as reported by the user.
- The project URL was derived from the existing database user's Supabase project reference and saved as `SUPABASE_URL` in `backend/.env`: `https://zrkmvpggshueninfxvmh.supabase.co`. `SUPABASE_REMINISCENCE_BUCKET=eldermeds-reminiscence-private` was also saved. Both values are nonsecret configuration. `.env` is ignored by root and backend `.gitignore`.
- `SUPABASE_SERVICE_ROLE_KEY` is absent from `backend/.env` and the current process environment. No authorized backend secret manager is connected. Therefore the backend cannot yet authenticate to the private Storage API, and photo persistence is **not ready**.
- Backend startup was verified on port 5000. `GET /api/health` returned HTTP 200 with database connectivity true. Startup performed the existing read-only `SELECT 1` path; automatic schema changes are disabled by default. No migrations, seed scripts, or schema writes were run.
- Focused reminiscence Storage/controller regression tests: **2 suites passed, 24 tests passed**. They mock Storage and do not verify live authenticated Storage API access.
- To finish, add the service-role key locally using a hidden secure prompt (instructions supplied to the user), restart the backend so dotenv reloads it, then perform an authenticated read-only Storage check. No photo upload or memory-record write has been performed; separate approval is required for that.


\r\n