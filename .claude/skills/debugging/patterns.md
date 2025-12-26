# Debugging Patterns

## React Component Issues

### Not Rendering
```typescript
// Check 1: Is component called?
console.log('[DEBUG] Render');

// Check 2: Props correct?
console.log('[DEBUG] Props:', props);

// Check 3: Early return?
if (!data) {
  console.log('[DEBUG] No data - returning null');
  return null;
}
```

### State Not Updating
```typescript
// Wrong - mutation
state.items.push(newItem);
setState(state);

// Right - new object
setState({
  ...state,
  items: [...state.items, newItem]
});
```

## API Issues

```typescript
try {
  console.log('[DEBUG] Request:', { url, options });
  const response = await fetch(url, options);
  console.log('[DEBUG] Status:', response.status);

  if (!response.ok) {
    const text = await response.text();
    console.log('[DEBUG] Error body:', text);
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
} catch (error) {
  console.error('[DEBUG] Failed:', error);
  throw error;
}
```

## TypeScript Issues

```typescript
// Find actual type
type Actual = typeof myVariable;

// Type guard
function isMyType(x: unknown): x is MyType {
  return typeof x === 'object' && x !== null && 'key' in x;
}

// Narrow carefully
if (isMyType(data)) {
  // data is now MyType
}
```

## Async Issues

```typescript
// Race condition fix
useEffect(() => {
  let cancelled = false;

  async function load() {
    const data = await fetchData();
    if (!cancelled) setData(data);
  }

  load();
  return () => { cancelled = true; };
}, []);
```

## Logging Best Practices

```typescript
// Use prefixes for filtering
console.log('[DB]', 'Query:', sql);
console.log('[API]', 'Request:', url);
console.log('[UI]', 'Render:', component);

// Remove before commit
// Consider: eslint no-console rule
```

## When Stuck

1. **Simplify** - Minimal reproduction
2. **Compare** - What's different from working code?
3. **Search** - Error message + technology
4. **Explain** - Rubber duck debugging
5. **Break** - Fresh perspective helps
