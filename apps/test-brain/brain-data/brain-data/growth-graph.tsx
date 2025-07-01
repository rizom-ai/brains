import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const RizomGrowthVisualization = () => {
  const [metric, setMetric] = useState("totalRevenue");

  // Updated scenarios based on rizom-brief.md
  const baseCase = {
    year1: {
      cores: 1,
      projectsPerCore: 2,
      averageProjectSize: 150,
      revenuePerCore: 0.6,
      totalRevenue: 0.6,
    },
    year3: {
      cores: 5,
      projectsPerCore: 3,
      averageProjectSize: 250,
      revenuePerCore: 1.5,
      totalRevenue: 7.5,
    },
    year5: {
      cores: 12,
      projectsPerCore: 4,
      averageProjectSize: 350,
      revenuePerCore: 2.8,
      totalRevenue: 33.6,
    },
  };

  const targetCase = {
    year1: {
      cores: 2,
      projectsPerCore: 2,
      averageProjectSize: 200,
      revenuePerCore: 0.8,
      totalRevenue: 1.6,
    },
    year3: {
      cores: 8,
      projectsPerCore: 3,
      averageProjectSize: 300,
      revenuePerCore: 1.8,
      totalRevenue: 14.4,
    },
    year5: {
      cores: 18,
      projectsPerCore: 4,
      averageProjectSize: 400,
      revenuePerCore: 3.2,
      totalRevenue: 57.6,
    },
  };

  const metrics = {
    totalRevenue: {
      label: "Total Revenue ($M)",
      formatter: (value) => `$${value}M`,
      description: "Total revenue across all cores",
    },
    cores: {
      label: "Number of Cores",
      formatter: (value) => value,
      description: "Total number of certified cores",
    },
    projectsPerCore: {
      label: "Projects per Core",
      formatter: (value) => value,
      description: "Average number of concurrent projects per core",
    },
    averageProjectSize: {
      label: "Avg Project Size ($K)",
      formatter: (value) => `$${value}K`,
      description: "Average revenue per project",
    },
    revenuePerCore: {
      label: "Revenue per Core ($M)",
      formatter: (value) => `$${value}M`,
      description: "Average annual revenue per core",
    },
  };

  const data = [1, 3, 5].map((year) => ({
    year,
    baseCase: baseCase[`year${year}`][metric],
    targetCase: targetCase[`year${year}`][metric],
  }));

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Rizom Growth Scenarios</CardTitle>
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.entries(metrics).map(([key, { label }]) => (
            <Button
              key={key}
              variant={metric === key ? "default" : "outline"}
              onClick={() => setMetric(key)}
              className="text-sm"
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                label={{ value: "Year", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                label={{
                  value: metrics[metric].label,
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
              />
              <Tooltip
                formatter={(value) => metrics[metric].formatter(value)}
                labelFormatter={(year) => `Year ${year}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="baseCase"
                name="Base Case"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="targetCase"
                name="Target Case"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">
            Current View: {metrics[metric].label}
          </h3>
          <p className="text-sm text-gray-600">{metrics[metric].description}</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded">
              <h4 className="font-medium text-blue-700">Base Case</h4>
              <p className="text-sm text-blue-600">
                Year 5: {metrics[metric].formatter(baseCase.year5[metric])}
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <h4 className="font-medium text-green-700">Target Case</h4>
              <p className="text-sm text-green-600">
                Year 5: {metrics[metric].formatter(targetCase.year5[metric])}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RizomGrowthVisualization;
