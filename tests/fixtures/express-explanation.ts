import { expressSources, expressCommit, expressBlobs } from "./express";
import type { Explanation } from "../../lib/explanation";
export const expressExplanationSource = expressSources.get("lib/express.js")!;
export const expressExplanationInput = {
  consent: true,
  repository: "expressjs/express",
  commit: expressCommit,
  path: "lib/express.js",
  blobSha: expressBlobs.get("lib/express.js"),
  source: expressExplanationSource,
  dependencies: [],
  analysisStatus: "parsed",
};
/** Manually quoted evidence from the pinned source; no generated expectations. */
export const expressExplanation: Explanation = {
  purpose: [
    {
      text: "Creates the Express application function and exposes its public helpers.",
      references: [
        {
          start: 27,
          end: 27,
          excerpt: "exports = module.exports = createApplication;",
        },
        {
          start: 37,
          end: 39,
          excerpt:
            "  var app = function(req, res, next) {\n    app.handle(req, res, next);\n  };",
        },
      ],
    },
  ],
  symbols: [
    {
      text: "The returned app forwards requests to app.handle(req, res, next).",
      references: [
        {
          start: 37,
          end: 39,
          excerpt:
            "  var app = function(req, res, next) {\n    app.handle(req, res, next);\n  };",
        },
      ],
    },
    {
      text: "Exports application, request and response prototypes.",
      references: [
        {
          start: 62,
          end: 64,
          excerpt:
            "exports.application = proto;\nexports.request = req;\nexports.response = res;",
        },
      ],
    },
    {
      text: "Re-exports Router and its Route constructor.",
      references: [
        {
          start: 70,
          end: 71,
          excerpt: "exports.Route = Router.Route;\nexports.Router = Router;",
        },
      ],
    },
    {
      text: "Re-exports parser and static middleware helpers.",
      references: [
        {
          start: 77,
          end: 81,
          excerpt:
            "exports.json = bodyParser.json\nexports.raw = bodyParser.raw\nexports.static = require('serve-static');\nexports.text = bodyParser.text\nexports.urlencoded = bodyParser.urlencoded",
        },
      ],
    },
  ],
  imports: [
    {
      text: "Uses mixin to attach EventEmitter and application methods to app.",
      references: [
        {
          start: 41,
          end: 42,
          excerpt:
            "  mixin(app, EventEmitter.prototype, false);\n  mixin(app, proto, false);",
        },
      ],
    },
  ],
  limitations: [],
};
