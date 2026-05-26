import { runViviProviderConformance } from "@vivi2d/provider-sdk/testing";
import {
  createTemplateMaskRequest,
  templateProvider,
} from "./template-provider.mjs";

const report = await runViviProviderConformance(templateProvider, [
  {
    name: "template mask proposal",
    request: createTemplateMaskRequest(),
    expectArtifactKinds: ["maskProposal"],
  },
]);

console.log(
  JSON.stringify(
    {
      providerId: report.providerId,
      caseCount: report.cases.length,
      cases: report.cases.map(({ name, artifactCount, warningCount }) => ({
        name,
        artifactCount,
        warningCount,
      })),
    },
    null,
    2,
  ),
);
