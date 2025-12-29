# /test - Run Tests

Run the test suite for the project.

## Arguments

$ARGUMENTS - Optional test filter or file path

## Steps

1. Run `pnpm test` (or with filter if provided)
2. Display test results:
   - Passing tests (green)
   - Failing tests (red) with details
   - Coverage summary
3. If tests fail:
   - Show failure details
   - Offer to investigate and fix

## Test Types

- Unit tests: `*.test.ts`
- Component tests: `*.test.tsx`
- Integration tests: `src/__tests__/integration/`

## Example

- `/test` - Run all tests
- `/test LineageCard` - Run tests matching "LineageCard"
- `/test src/components/` - Run tests in directory
