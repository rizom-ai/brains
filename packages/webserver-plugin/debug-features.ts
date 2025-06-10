import { featuresSectionSchema } from "./src/content-schemas";

// Test data that should be valid
const testFeatures = {
  label: "Features",
  headline: "Powerful Features",
  description: "Everything you need",
  features: [
    {
      icon: "lightning",
      title: "Fast Performance",
      description: "Lightning-fast search and retrieval",
    },
    {
      icon: "lock",
      title: "Secure Storage",
      description: "Your data is encrypted and private",
    },
    {
      icon: "brain",
      title: "Smart Organization",
      description: "AI-powered categorization",
    },
  ],
};

// Validate the data
const result = featuresSectionSchema.safeParse(testFeatures);

if (result.success) {
  console.log("✅ Features data is valid!");
  console.log("Data:", JSON.stringify(result.data, null, 2));
} else {
  console.log("❌ Features data is invalid!");
  console.log("Errors:", result.error.errors);
}

// Test YAML serialization
import * as yaml from "js-yaml";

const yamlString = yaml.dump(testFeatures, { indent: 2, lineWidth: -1 });
console.log("\nYAML output:");
console.log(yamlString);

// Test parsing back
const parsed = yaml.load(yamlString);
const parseResult = featuresSectionSchema.safeParse(parsed);

if (parseResult.success) {
  console.log("\n✅ YAML round-trip successful!");
} else {
  console.log("\n❌ YAML round-trip failed!");
  console.log("Errors:", parseResult.error.errors);
}