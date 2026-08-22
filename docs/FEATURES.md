# Features

## Implementation checklist

- [x] Public subject, module, recent-upload, and trending-resource discovery
- [x] Full-text document search, filters, pagination, and sorting
- [x] Email/password and Google authentication with profile onboarding
- [x] Document upload (PDF, Office, images, text), processing, R2 storage, moderation, and resubmission
- [x] Document viewing, bookmarks, study history, ratings, upvotes, and analytics
- [x] Threaded comments, mentions, flags, pinning, and moderation
- [x] Resource requests board with upvotes and upload-driven fulfilment
- [x] Student profiles, contribution impact, streaks, and achievements
- [x] Realtime notifications and achievement events
- [x] TOTP MFA-protected administration, bulk review, audit logs, and analytics
- [x] Responsive PWA shell, offline fallback, SEO metadata, and error states

## Discovery and study

- Browse subjects, modules, recent uploads, and weekly trending resources.
- Search approved documents with full-text search, category filters, subject filters, pagination, and sorting.
- Organize resources into notes, PYQs, syllabi, and tutorial sheets.
- View PDFs in the in-app React PDF viewer with document metadata and analytics. Images and text/Markdown files render in the same viewer; Office files show a download card.
- Track views, downloads, upvotes, ratings, and study history.
- Bookmark resources in the cloud, with local fallback/synchronization support.
- Continue studying from saved history.
- Use responsive layouts, dark/light themes, loading states, error boundaries, and an offline fallback route.

## Authentication and personalization

- Email/password signup and sign-in.
- Google OAuth sign-in.
- Email verification and password-reset flows.
- Profile onboarding with name, branch, favorite subjects, and academic year.
- Personalized subject ordering and discovery signals.
- Student profile with bookmarks, history, contributions, download impact, activity, streaks, and achievements.
- Realtime notifications and achievement toasts.

## Contribution and collaboration

- Upload documents with upload-progress feedback. Supported types and their size caps:

  | Type | Extensions | Maximum size |
  | --- | --- | --- |
  | PDF | `.pdf` | 50 MB |
  | Office | `.docx`, `.pptx`, `.xlsx` | 75 MB |
  | Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` | 10 MB |
  | Text | `.txt`, `.md` | 2 MB |

  SVG is deliberately excluded because it is a scriptable format and stored files are served directly from the storage origin. The allow-list lives in `backend/app/file_types.py` and is mirrored by `frontend/src/app/lib/file-types.ts`.
- Validate the filename extension, magic bytes, and per-type size cap, then run a type-specific structural check: PDFs are parsed for page count and a thumbnail, Office files are verified as OOXML containers with the expected internal parts and a bounded expansion ratio, images are rendered to a thumbnail, and text files must be NUL-free valid UTF-8.
- Submit documents for review and resubmit rejected documents with optional file replacement.
- Threaded comments with replies, edits, soft deletion, mentions, pinning, and flagging.
- Request resources that are missing from the portal on a public "wanted" board: pick a subject, module, and category, and other students upvote what they also need. Requests are sorted by demand, filterable by subject and status, and capped at ten open per student.
- Fulfil a request by uploading against it. The upload carries the request through moderation, and approving that document marks the request fulfilled, links it to the resource, and notifies the requester in realtime. Requesters can close or delete their own requests; administrators can delete any.
- Public contributor profiles and contribution history.

## Moderation and administration

- Review pending documents and flagged documents.
- Approve, reject, or return documents to pending status individually or in batches of up to 10.
- Record rejection reasons, notifications, and administrator audit events.
- Dismiss document flags as false alarms.
- Delete documents and their current R2 assets while preserving protection for legacy non-R2 URLs.
- Moderate, pin, and delete comments with an administrator reason.
- Manage subjects and modules.
- View administrator analytics.
- Require database admin membership plus a current TOTP MFA AAL2 session for protected administrative actions.

## Platform capabilities

- Installable PWA with manifest shortcuts and production service-worker generation.
- Server-rendered pages, dynamic document metadata, Open Graph/Twitter metadata, sitemap, and robots metadata.
- TanStack Query caching and TanStack Virtual for efficient resource lists.
- Sentry integration points for frontend and backend error monitoring.
- IP-based API rate limiting and restrictive production security headers/CSP.

## Related documentation

- [Architecture](ARCHITECTURE.md)
- [Security and Operations](SECURITY.md)
