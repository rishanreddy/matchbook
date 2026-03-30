# FRC Scouting App - Design System Guide

## Quick Reference

### Using Custom Classes

Import the classes via `index.css` (already global):

```tsx
// Grid pattern background
<Box className="grid-pattern">
  {/* Engineering paper aesthetic */}
</Box>

// Noise overlay texture
<Box className="noise-overlay">
  {/* Subtle texture over content */}
</Box>

// Blue glow effect
<Button className="glow-blue">
  Primary Action
</Button>

// Orange glow effect
<Button className="glow-orange">
  Success State
</Button>

// Monospace numbers
<Text className="mono-number">
  42
</Text>

// Animations
<Box className="animate-fadeInUp">
  {/* Fades in from bottom */}
</Box>

<Box className="animate-fadeInScale">
  {/* Scales up and fades in */}
</Box>

<Box className="animate-pulseGlow">
  {/* Pulsing glow effect */}
</Box>

// FRC accent line (gradient top border)
<Box className="frc-accent-line">
  {/* Blue-to-orange gradient */}
</Box>

// Data grid background
<Box className="data-grid">
  {/* Technical grid lines */}
</Box>
```

---

## Theme Colors

### Accessing FRC Colors in Components

```tsx
import { useMantineTheme } from '@mantine/core'

function MyComponent() {
  const theme = useMantineTheme()
  
  // Primary FRC blue
  <Button color="frc-blue.5">Click me</Button>
  
  // FRC orange accent
  <Badge color="frc-orange.5">New</Badge>
  
  // Custom usage
  <Box style={{ backgroundColor: theme.other.frcBlue }}>
    {/* Direct color access */}
  </Box>
}
```

### Color Reference

```tsx
// FRC Blue variations
'frc-blue.0' // Lightest: #e6f2ff
'frc-blue.5' // Primary: #0066b3 ← Use this
'frc-blue.9' // Darkest: #001a33

// FRC Orange variations
'frc-orange.0' // Lightest: #fff3e6
'frc-orange.5' // Primary: #f57c00 ← Use this
'frc-orange.9' // Darkest: #522900

// Slate (UI backgrounds)
'slate.8' // Main content: #1e293b
'slate.9' // Sidebar/header: #0f172a

// Semantic colors
theme.other.successGreen // #10b981
theme.other.errorRed     // #ef4444
```

---

## Typography

### Font Families

```tsx
// Body text (default)
<Text>Uses Inter</Text>

// Headings (default)
<Title order={1}>Uses Inter Bold</Title>

// Monospace (numbers/code)
<Text ff="JetBrains Mono">12345</Text>

// Or use the utility class
<Text className="mono-number">12345</Text>
```

### Heading Sizes

```tsx
<Title order={1}>36px, bold</Title>
<Title order={2}>28px, bold</Title>
<Title order={3}>22px, bold</Title>
<Title order={4}>18px, bold</Title>
```

### Font Weights

```tsx
<Text fw={400}>Regular (body text)</Text>
<Text fw={500}>Medium (default body)</Text>
<Text fw={600}>Semibold (emphasis)</Text>
<Text fw={700}>Bold (headings)</Text>
<Text fw={800}>Extrabold (hero text)</Text>
```

---

## Component Patterns

### Full-Screen Overlay (like FirstRunWizard)

```tsx
<Box
  pos="fixed"
  style={{ inset: 0, zIndex: 9999 }}
  className="grid-pattern noise-overlay"
>
  <Center h="100%">
    {/* Your content */}
  </Center>
</Box>
```

### Card with FRC Styling

```tsx
<Paper
  p="xl"
  radius="md"
  shadow="md"
  style={{
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(0, 102, 179, 0.2)',
  }}
  className="sharp-shadow"
>
  {/* Card content */}
</Paper>
```

### Primary Action Button

```tsx
<Button
  size="lg"
  color="frc-blue.5"
  className="glow-blue"
  styles={{
    root: {
      fontWeight: 700,
    },
  }}
>
  Primary Action
</Button>
```

### Success State Button

```tsx
<Button
  size="lg"
  color="frc-orange.5"
  className="glow-orange"
  disabled={!isReady}
>
  Start Scouting
</Button>
```

### Info Card

```tsx
<Paper
  p="md"
  radius="sm"
  style={{
    backgroundColor: 'rgba(0, 102, 179, 0.1)',
    border: '1px solid rgba(0, 102, 179, 0.2)',
  }}
>
  <Text size="sm" c="white">
    Important information here
  </Text>
</Paper>
```

### Badge with Monospace

```tsx
<Badge
  variant="light"
  color="frc-orange.5"
  className="mono-number"
  size="lg"
>
  v1.0.0
</Badge>
```

### Icon with Glow

```tsx
<ThemeIcon
  size={64}
  radius="xl"
  variant="light"
  color="frc-blue.5"
  className="glow-blue"
  style={{
    border: '2px solid rgba(0, 102, 179, 0.3)',
  }}
>
  <IconRocket size={32} />
</ThemeIcon>
```

### Animated Entrance

```tsx
<Stack gap="xl">
  <div className="animate-fadeInUp">
    First element
  </div>
  
  <div
    className="animate-fadeInUp"
    style={{ animationDelay: '0.1s' }}
  >
    Second element (staggered)
  </div>
  
  <div
    className="animate-fadeInUp"
    style={{ animationDelay: '0.2s' }}
  >
    Third element (more delay)
  </div>
</Stack>
```

---

## Navigation Styling

### Active Nav Item (automatically applied in App.tsx)

```tsx
<NavLink
  active={isActive}
  styles={{
    root: {
      borderRadius: 6,
      fontWeight: isActive ? 600 : 500,
      color: isActive ? 'white' : 'var(--mantine-color-gray-4)',
      '&[data-active]': {
        backgroundColor: 'rgba(0, 102, 179, 0.25)',
        borderLeft: '3px solid #0066b3',
      },
    },
  }}
/>
```

### Header with FRC Accent

```tsx
<AppShell.Header className="frc-accent-line">
  {/* Blue-to-orange gradient appears at top */}
</AppShell.Header>
```

---

## Spacing Guidelines

### Component Gaps

```tsx
// Tight groupings (related items)
<Stack gap="xs">     {/* 4-8px */}

// Related elements
<Stack gap="sm">     {/* 8-12px */}

// Section spacing
<Stack gap="md">     {/* 16-20px */}

// Major divisions
<Stack gap="lg">     {/* 24-32px */}

// Page sections
<Stack gap="xl">     {/* 40-64px */}
```

### Padding

```tsx
// Compact cards
<Paper p="sm">       {/* 8-12px */}

// Standard cards
<Paper p="md">       {/* 16-20px */}

// Spacious cards
<Paper p="xl">       {/* 32-40px */}
```

---

## Shadow & Border Styles

### Flat (Most Cards)

```tsx
<Paper shadow="none">
  {/* Flat card in dark UI */}
</Paper>
```

### Soft Shadow (Elevated)

```tsx
<Paper shadow="md">
  {/* 0 4px 8px rgba(0,0,0,0.3) */}
</Paper>
```

### Sharp Shadow (Industrial)

```tsx
<Paper className="sharp-shadow">
  {/* 4px 4px 0 rgba(0,0,0,0.3) */}
</Paper>
```

### Glow (Primary Actions)

```tsx
<Button className="glow-blue">
  {/* 0 0 24px rgba(0,102,179,0.4) */}
</Button>
```

---

## Responsive Breakpoints

```tsx
// Hide on mobile
<Box hiddenFrom="sm">Desktop only</Box>

// Hide on desktop
<Box visibleFrom="sm">Mobile only</Box>

// Mantine breakpoints
xs: 36em  // 576px
sm: 48em  // 768px
md: 62em  // 992px
lg: 75em  // 1200px
xl: 88em  // 1408px
```

---

## Animation Timing

### Durations

```tsx
// Fast interactions (hover, toggle)
transition: 'all 0.15s ease-out'

// Standard transitions (navigation)
transition: 'all 0.2s ease-in-out'

// Slow transitions (page changes)
transition: 'all 0.3s ease-in-out'

// Entrance animations
animation: 'fadeInUp 0.5s ease-out forwards'
```

### Staggered Delays

```tsx
// Use 0.1s increments for staggering
style={{ animationDelay: '0.1s' }}
style={{ animationDelay: '0.2s' }}
style={{ animationDelay: '0.3s' }}
```

---

## Best Practices

### DO ✅

- Use `frc-blue.5` and `frc-orange.5` for brand colors
- Add `className="mono-number"` for stats and data
- Use `glow-blue` on primary actions
- Apply `grid-pattern` for full-screen backgrounds
- Stagger animations with delays
- Use dark slate backgrounds (`slate.8`, `slate.9`)
- Add sharp shadows for industrial feel
- Use bold font weights (600-800) for emphasis

### DON'T ❌

- Don't use soft pastels
- Don't use rounded corners everywhere
- Don't use generic spinners (use progress bars)
- Don't use light backgrounds in main UI
- Don't mix soft shadows with sharp aesthetic
- Don't use regular font weights for headings
- Don't use Inter for numbers (use JetBrains Mono)

---

## Accessibility Checklist

- [ ] Color contrast ratios meet WCAG AA
- [ ] Focus states visible
- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation works
- [ ] Screen reader friendly
- [ ] Skip links functional
- [ ] Alt text on images
- [ ] Form labels present

---

## Common Scenarios

### Creating a New Page

```tsx
import { Box, Container, Stack, Title, Text } from '@mantine/core'

export function MyPage() {
  return (
    <Container size="lg">
      <Stack gap="xl">
        <div>
          <Title order={2} c="white" fw={700} mb="xs">
            Page Title
          </Title>
          <Text size="md" c="dimmed">
            Page description
          </Text>
        </div>
        
        {/* Content sections */}
      </Stack>
    </Container>
  )
}
```

### Creating a Modal/Dialog

```tsx
import { Modal, Stack, Button, Text } from '@mantine/core'

<Modal
  opened={opened}
  onClose={onClose}
  title="Dialog Title"
  styles={{
    content: {
      backgroundColor: 'var(--mantine-color-slate-9)',
    },
    header: {
      backgroundColor: 'var(--mantine-color-slate-9)',
      borderBottom: '1px solid rgba(0, 102, 179, 0.2)',
    },
    body: {
      backgroundColor: 'var(--mantine-color-slate-9)',
    },
  }}
>
  <Stack gap="md">
    <Text c="white">
      Modal content
    </Text>
    <Button color="frc-blue.5" className="glow-blue">
      Confirm
    </Button>
  </Stack>
</Modal>
```

### Creating a Stats Card

```tsx
<Paper
  p="lg"
  radius="md"
  style={{
    backgroundColor: 'rgba(0, 102, 179, 0.1)',
    border: '1px solid rgba(0, 102, 179, 0.2)',
  }}
>
  <Stack gap="xs">
    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
      Total Matches
    </Text>
    <Text size="xl" fw={800} c="white" className="mono-number">
      142
    </Text>
  </Stack>
</Paper>
```

---

## Testing Your Design

Run the app and verify:

```bash
# Development
npm run dev

# Electron
npm run electron:dev

# Production build
npm run build
```

Check:
- First-run wizard displays full-screen
- Splash screen animates smoothly
- Navigation highlights active items
- Buttons have proper glow effects
- Colors match FRC brand
- Typography hierarchy is clear
- Animations are smooth (not janky)

---

## Resources

- [Mantine Documentation](https://mantine.dev/)
- [FRC Brand Guidelines](https://www.firstinspires.org/)
- [The Blue Alliance](https://www.thebluealliance.com/)
- [Inter Font](https://fonts.google.com/specimen/Inter)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)

---

## Support

For questions or issues with the design system:
1. Check this guide first
2. Review `DESIGN_UPDATES.md` for detailed changes
3. Inspect component examples in `FirstRunWizard.tsx`
4. Test in Electron app environment
