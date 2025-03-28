# Error Handling System Documentation

This document provides an overview of the new error handling system implemented in the Chess Betting Platform backend. The system has been designed to standardize error responses, simplify error handling in controllers and services, and provide better error information for debugging and client feedback.

## Core Components

### Error Types

The system defines a hierarchy of error types in `utils/errorTypes.js`:

```
AppError (base class)
├── AuthenticationError
├── AuthorizationError
├── ValidationError
├── ResourceNotFoundError
├── ResourceConflictError
├── DatabaseError
├── ExternalServiceError
└── InternalServerError
```

Each error type includes:
- HTTP status code
- Error code for client-side handling
- Descriptive message
- Optional data for additional context

### Error Middleware

Central error handling is implemented in `middleware/errorMiddleware.js` with these components:

1. **errorHandler**: Processes all errors and generates standardized responses
2. **asyncHandler**: Utility to eliminate try/catch blocks in async functions
3. **notFoundHandler**: Catches requests to undefined routes

## Usage Patterns

### In Route Handlers

```javascript
// Before
router.post('/endpoint', async (req, res) => {
  try {
    // Logic
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// After
router.post('/endpoint', asyncHandler(async (req, res) => {
  // Logic
  if (!user) {
    throw new ResourceNotFoundError('User');
  }
  res.json({ success: true });
}));
```

### In Services

```javascript
// Before
const someService = async () => {
  try {
    // Logic
    if (error) {
      return { success: false, error: 'Service error' };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// After
const someService = async () => {
  // Logic
  if (error) {
    throw new ExternalServiceError('ServiceName', 'Service error');
  }
  return data;
};
```

### In Middleware

```javascript
// Before
const middleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// After
const middleware = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }
  next();
};
```

## Error Response Format

All error responses follow this standardized format:

```json
{
  "status": "error",
  "errorCode": "ERROR_CODE",
  "message": "Human-readable error message",
  "data": null, // Optional additional context
  "timestamp": "2025-03-28T12:34:56.789Z"
}
```

In development mode, responses also include a `stack` property with the error stack trace.

## Error Codes and HTTP Status Codes

| Error Type | Error Code | HTTP Status |
|------------|------------|------------|
| AuthenticationError | AUTH_ERROR | 401 |
| AuthorizationError | FORBIDDEN | 403 |
| ValidationError | VALIDATION_ERROR | 400 |
| ResourceNotFoundError | NOT_FOUND | 404 |
| ResourceConflictError | CONFLICT | 409 |
| DatabaseError | DATABASE_ERROR | 500 |
| ExternalServiceError | EXTERNAL_SERVICE_ERROR | 502 |
| InternalServerError | INTERNAL_SERVER_ERROR | 500 |

## Request Tracking

Each request is assigned a unique ID using the UUID package, which is:
- Added to the request object as `req.id`
- Included in response headers as `X-Request-ID`
- Logged with errors for easier debugging

## Testing

The error handling system has been integrated with the testing framework:
- Mock request and response objects include error handling
- Test utilities can validate error responses
- Error types can be imported and used in test assertions

## Benefits

This error handling system provides several advantages:

1. **Consistency**: All API endpoints return errors in the same format
2. **Simplicity**: Controllers and services are cleaner without try/catch blocks
3. **Maintainability**: Error handling is centralized and easier to update
4. **Debugging**: Better error context and request tracking
5. **Client Experience**: More informative errors for front-end handling

## Implementation Guidelines

When implementing new features or modifying existing code:

1. Import the appropriate error types and `asyncHandler`
2. Replace direct response error handling with appropriate error throws
3. Use specific error types that match the error scenario
4. Include helpful context in error messages
5. For controllers, wrap handler functions with `asyncHandler`

---

This documentation provides a comprehensive overview of the new error handling system. Refer to specific files for implementation details and additional examples.
