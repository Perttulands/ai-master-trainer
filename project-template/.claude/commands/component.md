# /component - Generate React Component

Create a new React component with proper structure.

## Arguments

$ARGUMENTS - Component name and optional path

## Steps

1. Parse component name from arguments (e.g., "LineageCard" or "cards/LineageCard")
2. Determine target directory:
   - Default: `src/components/`
   - If path specified: `src/components/{path}/`
3. Create component file with:
   - TypeScript interface for props
   - Functional component with proper typing
   - Tailwind CSS classes for styling
   - Export statement
4. Follow naming conventions from CLAUDE.md

## Template

```tsx
interface {ComponentName}Props {
  // props here
}

export function {ComponentName}({ }: {ComponentName}Props) {
  return (
    <div className="">
      {/* component content */}
    </div>
  );
}
```

## Example

`/component cards/LineageCard` creates `src/components/cards/LineageCard.tsx`
