import type { Preview } from "@storybook/preact";
import "../src/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

document.body.style.backgroundColor = "red";

export default preview;
