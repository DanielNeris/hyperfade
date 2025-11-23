# hyperfade

**Secure time-based ephemeral storage for Hyperdrive.** Automatically unlock and delete content with tamper-resistant timestamps.

## 🔒 Security First

This library is built with security as a core principle:

- ✅ **Path traversal protection**: All file paths are validated and sanitized
- ✅ **Clock manipulation resistance**: Monotonic clock prevents time-based attacks
- ✅ **Input validation**: All metadata is validated before processing
- ✅ **Timestamp validation**: Prevents bypass attacks with extreme values
- ✅ **DoS protection**: Size limits and rate limiting prevent resource exhaustion
- ✅ **Deletion verification**: Ensures files are actually removed

## Features

- **Time-based unlocking**: Content becomes visible after a specified time (`unlockAt`)
- **Automatic deletion**: Content is automatically deleted after expiration (`expiresAt`)
- **Garbage collection**: Built-in GC system with manual and automatic modes
- **Hyperdrive integration**: Ready-to-use adapter for Hyperdrive storage
- **Secure by default**: All security features enabled automatically

## Installation

```bash
npm install hyperfade
```

## Quick Start

### Basic Setup

```javascript
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import { createHyperdriveEphemeralGC } from "hyperfade";
import { createMonotonicNow } from "hyperfade/lib/time.js";

// Create your Hyperdrive instance
const corestore = new Corestore("./storage");
const drive = new Hyperdrive(corestore);

// Create ephemeral GC with automatic cleanup
const { ctx, runOnce, auto } = createHyperdriveEphemeralGC(drive, {
  prefix: "/sessions", // Required: where to store sessions
  metaFile: "meta.json", // Optional: meta file name (default: 'meta.json')
  filesToDelete: ["audio.m4a", "data.txt"], // Required: files to delete on expiration
  intervalMs: 60000, // Optional: GC interval (default: 60s)
});

// Start automatic garbage collection
auto.start();

// Later, stop it
auto.stop();
```

### Creating Ephemeral Content

```javascript
import { createMonotonicNow } from "hyperfade/lib/time.js";

// Use monotonic clock for security (prevents clock manipulation)
const now = createMonotonicNow();
const currentTime = now();

// Create a session that expires in 5 minutes
const meta = {
  id: "session-123",
  createdAt: currentTime,
  updatedAt: currentTime,
  expiresAt: currentTime + 5 * 60 * 1000, // 5 minutes from now
};

// Save meta (includes security validation)
await ctx.saveMeta(meta);

// Save your files
await drive.put("/sessions/session-123/audio.m4a", audioBuffer);
await drive.put("/sessions/session-123/data.txt", textBuffer);
```

### Checking Visibility

```javascript
import { isVisible, isUnlocked, isExpired } from "hyperfade";
import { createMonotonicNow } from "hyperfade/lib/time.js";

const now = createMonotonicNow();
const currentTime = now();

// Load meta from Hyperdrive
const metaBuffer = await drive.get("/sessions/session-123/meta.json");
const meta = JSON.parse(metaBuffer.toString("utf8"));

// Check status
if (isVisible(meta, currentTime)) {
  // Content is unlocked and not expired - safe to read
  const data = await drive.get("/sessions/session-123/data.txt");
  console.log("Content:", data.toString("utf8"));
} else if (!isUnlocked(meta, currentTime)) {
  console.log("Content is still locked");
} else if (isExpired(meta, currentTime)) {
  console.log("Content has expired");
}
```

### Manual Garbage Collection

```javascript
// Run GC once manually
const result = await runOnce();
console.log(`Expired ${result.expired} items`);
```

## Complete Examples

### Example 1: Auto-Delete After Expiration

See `examples/delete.js` for a complete example of content that automatically deletes after a set time.

```javascript
import { createHyperdriveEphemeralGC } from "hyperfade";
import { createMonotonicNow } from "hyperfade/lib/time.js";

const { ctx, auto } = createHyperdriveEphemeralGC(drive, {
  prefix: "/sessions",
  filesToDelete: ["meta.json", "audio.m4a", "payload.txt"],
  intervalMs: 5000, // Check every 5 seconds
});

// Create session that expires in 2 seconds
const now = createMonotonicNow();
const meta = {
  id: "session-1",
  createdAt: now(),
  updatedAt: now(),
  expiresAt: now() + 2000,
};

await ctx.saveMeta(meta);
await drive.put("/sessions/session-1/payload.txt", Buffer.from("Hello!"));

// Start auto-GC
auto.start();

// After 2+ seconds, files will be automatically deleted
```

### Example 2: Time-Locked Content

See `examples/visible.js` for a complete example of content that unlocks after a set time.

```javascript
import { createHyperdriveEphemeralContext, isVisible } from "hyperfade";
import { createMonotonicNow } from "hyperfade/lib/time.js";

const ctx = createHyperdriveEphemeralContext(drive, {
  prefix: "/sessions",
  metaFile: "meta.json",
  filesToDelete: [], // Not using deletion in this example
});

// Create session that unlocks in 1 second
const now = createMonotonicNow();
const meta = {
  id: "session-1",
  createdAt: now(),
  updatedAt: now(),
  unlockAt: now() + 1000,
};

await ctx.saveMeta(meta);
await drive.put(
  "/sessions/session-1/message.txt",
  Buffer.from("Secret message!")
);

// Check visibility
const currentTime = now();
if (isVisible(meta, currentTime)) {
  // Content is visible
} else {
  // Content is locked - wait for unlockAt
}
```

## API Reference

### Core Functions

#### `isExpired(meta, now)`

Checks if a meta object has expired.

- **Parameters:**
  - `meta` (EphemeralMeta): Meta object to check
  - `now` (number): Current timestamp (use `createMonotonicNow()()`)
- **Returns:** `boolean` - `true` if expired, `false` otherwise
- **Security:** Validates timestamps to prevent bypass attacks

#### `isUnlocked(meta, now)`

Checks if a meta object is unlocked.

- **Parameters:**
  - `meta` (EphemeralMeta): Meta object to check
  - `now` (number): Current timestamp (use `createMonotonicNow()()`)
- **Returns:** `boolean` - `true` if unlocked, `false` otherwise
- **Security:** Validates timestamps to prevent bypass attacks

#### `isVisible(meta, now)`

Checks if a meta object is visible (unlocked AND not expired).

- **Parameters:**
  - `meta` (EphemeralMeta): Meta object to check
  - `now` (number): Current timestamp (use `createMonotonicNow()()`)
- **Returns:** `boolean` - `true` if visible, `false` otherwise

### Garbage Collection

#### `runEphemeralGC(ctx, options?)`

Runs garbage collection manually.

- **Parameters:**
  - `ctx` (EphemeralGCContext): GC context
  - `options.nowFn` (optional): Clock function (defaults to `createMonotonicNow()`)
- **Returns:** `Promise<{ expired: number }>`

#### `createEphemeralAutoGC(ctx, options?)`

Creates an automatic GC controller.

- **Parameters:**
  - `ctx` (EphemeralGCContext): GC context
  - `options.intervalMs` (optional): Interval in milliseconds (default: 60000)
  - `options.nowFn` (optional): Clock function (defaults to `createMonotonicNow()`)
- **Returns:** `{ start(), stop(), isRunning() }`

### Hyperdrive Adapter

#### `createHyperdriveEphemeralContext(drive, options)`

Creates a GC context for Hyperdrive.

- **Parameters:**
  - `drive`: Hyperdrive instance
  - `options.prefix` (string, **required**): Directory prefix
  - `options.metaFile` (string, optional): Meta file name (default: `'meta.json'`)
  - `options.filesToDelete` (string[], **required**): Files to delete on expiration
- **Returns:** `EphemeralGCContext` with `listMetas()`, `saveMeta(meta)`, `onExpire(meta)`

#### `createHyperdriveEphemeralGC(drive, options)`

Complete setup with convenience methods.

- **Parameters:** Same as `createHyperdriveEphemeralContext` plus:
  - `options.intervalMs` (number, optional): Auto-GC interval (default: 60000)
- **Returns:** `{ ctx, runOnce(), auto }`

### Security Utilities

#### `createMonotonicNow(options?)`

Creates a tamper-resistant clock function.

- **Parameters:**
  - `options.maxBackwardsMs` (optional): Tolerance for backward jumps (default: 1000ms)
  - `options.maxForwardMs` (optional): Max forward jump allowed (default: 1 hour)
- **Returns:** `() => number` - Clock function that never goes backwards
- **Security:** Prevents clock manipulation attacks

```javascript
import { createMonotonicNow } from "hyperfade/lib/time.js";

const now = createMonotonicNow();
const currentTime = now(); // Always increasing, tamper-resistant
```

## Data Structure

### EphemeralMeta

```typescript
interface EphemeralMeta {
  id: string; // Required: Unique identifier (alphanumeric, hyphens, underscores only)
  createdAt: number; // Required: Creation timestamp (ms)
  updatedAt: number; // Required: Last update timestamp (ms)
  unlockAt?: number; // Optional: Unlock timestamp (ms)
  expiresAt?: number; // Optional: Expiration timestamp (ms)
}
```

**Security Constraints:**

- `id`: Max 255 chars, must match `/^[a-zA-Z0-9_-]+$/`
- All timestamps: Must be finite numbers within reasonable bounds (0 to 100 years in future)
- Invalid data is rejected during `saveMeta()` and filtered during `listMetas()`

## Security Features

### Path Traversal Protection

All file paths are validated and sanitized. Invalid characters (`..`, `/`, `\`) are rejected entirely.

```javascript
// ✅ Valid
await ctx.saveMeta({ id: 'session-123', ... })

// ❌ Invalid - will throw error
await ctx.saveMeta({ id: '../etc/passwd', ... })
```

### Clock Manipulation Resistance

The library uses a monotonic clock that never goes backwards, preventing attackers from manipulating system time to bypass expiration.

```javascript
// Always use createMonotonicNow() for security
const now = createMonotonicNow();
const currentTime = now(); // Protected against clock manipulation
```

### Input Validation

All metadata is validated before processing:

- **ID format**: Alphanumeric, hyphens, underscores only
- **Timestamps**: Must be finite numbers within reasonable bounds
- **File sizes**: Meta files limited to 5MB
- **Structure**: Required fields validated, invalid data rejected

### Deletion Verification

Files are verified to be actually deleted after expiration, with retry logic for edge cases.

## Best Practices

1. **Always use `createMonotonicNow()`** for timestamps in production
2. **Validate user input** before creating meta objects
3. **Use `ctx.saveMeta()`** instead of writing meta.json directly (includes validation)
4. **Check `isVisible()`** before reading content
5. **Handle errors** from `saveMeta()` (validation errors are thrown)
6. **Monitor logs** for security warnings (invalid data, clock jumps, etc.)

## Error Handling

```javascript
try {
  await ctx.saveMeta(meta);
} catch (err) {
  if (err.message.includes("Invalid meta.id")) {
    // Handle invalid ID format
  } else if (err.message.includes("Invalid metaFile")) {
    // Handle invalid file name
  } else {
    // Handle other errors
  }
}
```

## P2P Considerations

⚠️ **Important**: This library provides **local garbage collection**. In P2P networks:

- Expired data is deleted locally
- Other peers may still have the data
- Peers can re-replicate expired data back
- Consider using Hyperdrive access controls for additional protection

## License

MIT

## Contributing
