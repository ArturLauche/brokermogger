# Fair use

Limits exist so one account cannot exhaust the instance or a destination domain. They are operational, not a paid upgrade. The UI must say so.

Defaults (`lib/config/systemSettings.ts` and `UserQuota`):

- 25 new requests per day
- 200 new requests per month
- 5 requests to the same broker per 30 days
- 30 sends per destination domain per hour (instance-wide)
- 24 hour account age before large bulk creates

When a limit is hit the error code is `QUOTA_EXCEEDED` or `RATE_LIMITED`. The new-request screen explains that this is not an upgrade wall.
