import { defineConfig, globalIgnores } from "eslint/config";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SOURCE_DIRECTORY = fileURLToPath(new URL("./src/", import.meta.url));
const LAYERS = ["app", "screens", "widgets", "features", "entities", "shared"];

/** 경로를 정규화해 별칭이나 상대 경로로 FSD 경계를 우회하지 못하게 합니다. */
function getModuleInfo(filename) {
  const parts = relative(SOURCE_DIRECTORY, filename).split(sep);
  const [layer, slice] = parts;

  return { layer, slice, parts, rank: LAYERS.indexOf(layer) };
}

const importBoundaries = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      upperLayer: "{{source}}에서 상위 레이어 {{target}}를 참조할 수 없습니다.",
      sameLayer: "같은 레이어의 다른 슬라이스 {{target}}를 직접 참조할 수 없습니다.",
      publicApi: "{{target}}의 내부 파일 대신 슬라이스의 index.ts 공개 API를 사용하세요.",
    },
  },
  create(context) {
    const source = getModuleInfo(context.filename);

    /** 같은 슬라이스 내부 참조는 허용하고 외부 참조의 레이어와 공개 진입점을 검사합니다. */
    function checkImport(node) {
      const value = node?.value;

      if (typeof value !== "string") return;

      let filename;

      if (value.startsWith("@/")) {
        filename = resolve(SOURCE_DIRECTORY, value.slice(2));
      } else if (value.startsWith(".")) {
        filename = resolve(dirname(context.filename), value);
      } else {
        return;
      }

      const target = getModuleInfo(filename);

      if (source.rank < 0 || target.rank < 0) return;

      // app과 shared는 슬라이스가 없고, 그 밖의 레이어는 자기 슬라이스 안에서만 자유롭게 참조합니다.
      if (source.layer === target.layer) {
        if (["app", "shared"].includes(source.layer) || source.slice === target.slice) return;

        context.report({ node, messageId: "sameLayer", data: { target: value } });
        return;
      }

      if (target.rank < source.rank) {
        context.report({ node, messageId: "upperLayer", data: { source: source.layer, target: target.layer } });
        return;
      }

      // shared의 모듈 구조는 슬라이스와 다르므로 슬라이스 공개 API 검사는 중간 네 레이어에만 적용합니다.
      if (["app", "shared"].includes(target.layer)) return;

      const isPublicApi = target.parts.length === 2 || (
        target.parts.length === 3 && /^index(?:\.[cm]?[jt]sx?)?$/.test(target.parts[2])
      );

      if (!isPublicApi) {
        context.report({ node, messageId: "publicApi", data: { target: value } });
      }
    }

    return {
      ImportDeclaration: (node) => checkImport(node.source),
      ExportNamedDeclaration: (node) => checkImport(node.source),
      ExportAllDeclaration: (node) => checkImport(node.source),
      ImportExpression: (node) => checkImport(node.source),
      TSImportType: (node) => checkImport(node.argument.literal),
      TSExternalModuleReference: (node) => checkImport(node.expression),
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mts,mjs}"],
    plugins: {
      architecture: { rules: { "import-boundaries": importBoundaries } },
    },
    rules: { "architecture/import-boundaries": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
