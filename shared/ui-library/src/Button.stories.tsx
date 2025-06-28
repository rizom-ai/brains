import type { Meta, StoryObj } from "@storybook/preact";
import Button from "./Button";

const meta: Meta<typeof Button> = {
  component: Button,
  title: "Components/Button",
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  render: () => (
    <Button onClick={() => alert("Button clicked!")}>Primary Button</Button>
  ),
};
