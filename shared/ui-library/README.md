# @brains/ui-library

Shared UI components and design system for Personal Brain applications.

## Overview

This package provides a comprehensive UI component library and design system used across Brain applications. It includes React components, design tokens, accessibility utilities, and theming support.

## Features

- React component library
- Design system tokens
- Accessibility-first components
- Theme customization
- Responsive utilities
- Animation helpers
- Form components with validation
- Data visualization components

## Installation

```bash
bun add @brains/ui-library
```

## Usage

```tsx
import { Button, Card, Input, ThemeProvider } from "@brains/ui-library";

function App() {
  return (
    <ThemeProvider theme="light">
      <Card>
        <Card.Header>
          <Card.Title>Welcome</Card.Title>
        </Card.Header>
        <Card.Body>
          <Input label="Name" placeholder="Enter your name" />
          <Button variant="primary">Submit</Button>
        </Card.Body>
      </Card>
    </ThemeProvider>
  );
}
```

## Components

### Layout Components

```tsx
import { Container, Grid, Stack, Flex, Spacer } from "@brains/ui-library";

<Container maxWidth="lg">
  <Grid cols={3} gap={4}>
    <Grid.Item>Item 1</Grid.Item>
    <Grid.Item span={2}>Item 2</Grid.Item>
  </Grid>

  <Stack spacing={2}>
    <div>Stacked item 1</div>
    <div>Stacked item 2</div>
  </Stack>

  <Flex justify="between" align="center">
    <div>Left</div>
    <Spacer />
    <div>Right</div>
  </Flex>
</Container>;
```

### Form Components

```tsx
import {
  Form,
  Input,
  Select,
  Checkbox,
  Radio,
  TextArea,
  FormField,
} from "@brains/ui-library";

<Form onSubmit={handleSubmit}>
  <FormField name="email" label="Email" required>
    <Input type="email" />
  </FormField>

  <FormField name="role" label="Role">
    <Select>
      <Select.Option value="admin">Admin</Select.Option>
      <Select.Option value="user">User</Select.Option>
    </Select>
  </FormField>

  <FormField name="bio" label="Bio">
    <TextArea rows={4} />
  </FormField>

  <Checkbox name="terms">I agree to the terms</Checkbox>

  <Button type="submit">Submit</Button>
</Form>;
```

### Data Display

```tsx
import {
  Table,
  List,
  Card,
  Badge,
  Avatar,
  Tooltip,
} from "@brains/ui-library";

<Table data={users}>
  <Table.Column field="avatar" header="">
    {(user) => <Avatar src={user.avatar} />}
  </Table.Column>
  <Table.Column field="name" header="Name" sortable />
  <Table.Column field="status" header="Status">
    {(user) => (
      <Badge variant={user.active ? "success" : "neutral"}>
        {user.status}
      </Badge>
    )}
  </Table.Column>
</Table>

<List>
  {items.map(item => (
    <List.Item key={item.id}>
      <List.ItemText primary={item.title} secondary={item.description} />
      <List.ItemAction>
        <Tooltip content="Delete">
          <Button icon="trash" variant="ghost" />
        </Tooltip>
      </List.ItemAction>
    </List.Item>
  ))}
</List>
```

### Navigation

```tsx
import {
  Navbar,
  Sidebar,
  Breadcrumb,
  Tabs,
  Menu,
} from "@brains/ui-library";

<Navbar>
  <Navbar.Brand>Brain</Navbar.Brand>
  <Navbar.Nav>
    <Navbar.Link href="/">Home</Navbar.Link>
    <Navbar.Link href="/about">About</Navbar.Link>
  </Navbar.Nav>
</Navbar>

<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Tab value="tab1">Tab 1</Tabs.Tab>
    <Tabs.Tab value="tab2">Tab 2</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
  <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
</Tabs>
```

### Feedback Components

```tsx
import {
  Alert,
  Toast,
  Modal,
  Drawer,
  Progress,
  Spinner,
} from "@brains/ui-library";

// Alerts
<Alert variant="info">
  Information message
</Alert>

// Toasts
toast.success("Operation successful!");
toast.error("Something went wrong");

// Modals
<Modal open={isOpen} onClose={handleClose}>
  <Modal.Header>
    <Modal.Title>Confirm Action</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    Are you sure you want to proceed?
  </Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" onClick={handleClose}>Cancel</Button>
    <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
  </Modal.Footer>
</Modal>

// Progress
<Progress value={60} max={100} />
<Spinner size="lg" />
```

## Theming

### Theme Provider

```tsx
import { ThemeProvider, createTheme } from "@brains/ui-library";

const customTheme = createTheme({
  colors: {
    primary: "#007bff",
    secondary: "#6c757d",
    success: "#28a745",
    danger: "#dc3545",
  },
  typography: {
    fontFamily: "Inter, sans-serif",
    fontSize: {
      base: "16px",
      sm: "14px",
      lg: "18px",
    },
  },
  spacing: {
    unit: 8,
  },
  borderRadius: {
    base: "4px",
    lg: "8px",
  },
});

<ThemeProvider theme={customTheme}>
  <App />
</ThemeProvider>;
```

### Dark Mode

```tsx
import { useDarkMode } from "@brains/ui-library";

function App() {
  const { isDark, toggle } = useDarkMode();

  return (
    <Button onClick={toggle}>{isDark ? "Light Mode" : "Dark Mode"}</Button>
  );
}
```

## Design Tokens

```typescript
import { tokens } from "@brains/ui-library";

// Colors
tokens.colors.primary; // "#007bff"
tokens.colors.gray[500]; // "#6c757d"

// Typography
tokens.typography.fontSizes.base; // "16px"
tokens.typography.lineHeights.normal; // 1.5

// Spacing
tokens.spacing[4]; // "32px"

// Shadows
tokens.shadows.sm; // "0 1px 2px rgba(0,0,0,0.05)"
```

## Accessibility

### ARIA Support

```tsx
// All components include proper ARIA attributes
<Button aria-label="Close dialog">×</Button>

<Input aria-describedby="email-hint" />
<span id="email-hint">Enter your email address</span>

// Keyboard navigation
<Menu>
  <Menu.Item>Item 1</Menu.Item> {/* Arrow keys work */}
  <Menu.Item>Item 2</Menu.Item>
</Menu>
```

### Focus Management

```tsx
import { FocusTrap, useFocusReturn } from "@brains/ui-library";

<FocusTrap active={isModalOpen}>
  <Modal>{/* Focus is trapped within modal */}</Modal>
</FocusTrap>;
```

## Hooks

```tsx
import {
  useTheme,
  useDarkMode,
  useMediaQuery,
  useClickOutside,
  useKeyPress,
  useDebounce,
  useLocalStorage,
} from "@brains/ui-library/hooks";

// Responsive design
const isMobile = useMediaQuery("(max-width: 768px)");

// Click outside detection
const ref = useClickOutside(() => {
  closeDropdown();
});

// Keyboard shortcuts
useKeyPress("Escape", () => {
  closeModal();
});

// Debounced search
const debouncedSearch = useDebounce(searchTerm, 300);
```

## Utilities

### CSS-in-JS

```tsx
import { css, styled } from "@brains/ui-library/styles";

const StyledDiv = styled.div`
  padding: ${(props) => props.theme.spacing[4]};
  color: ${(props) => props.theme.colors.primary};
`;

const dynamicStyles = css`
  background: ${(props) => (props.active ? "blue" : "gray")};
`;
```

### Class Names

```tsx
import { cn } from "@brains/ui-library/utils";

<div
  className={cn(
    "base-class",
    isActive && "active",
    isDisabled && "disabled",
    className,
  )}
/>;
```

## Animation

```tsx
import {
  Transition,
  AnimatePresence,
  animations,
} from "@brains/ui-library/animation";

<Transition
  in={isVisible}
  animation="fadeIn"
  duration={300}
>
  <div>Animated content</div>
</Transition>

<AnimatePresence>
  {items.map(item => (
    <Transition key={item.id} animation="slideUp">
      <Card>{item.content}</Card>
    </Transition>
  ))}
</AnimatePresence>
```

## Testing

```tsx
import { render, screen } from "@brains/ui-library/test";

test("Button renders correctly", () => {
  render(<Button>Click me</Button>);
  expect(screen.getByRole("button")).toHaveTextContent("Click me");
});
```

## Storybook

View all components in Storybook:

```bash
bun run storybook
```

## Exports

- All UI components
- `ThemeProvider` and theming utilities
- Design tokens
- Hooks collection
- Animation utilities
- Testing utilities
- TypeScript types

## License

MIT
