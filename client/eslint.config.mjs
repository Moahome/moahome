import {
  defineConfig,
  globalIgnores
} from 'eslint/config';
import {
  dirname,
  relative,
  resolve,
  sep
} from 'node:path';
import { fileURLToPath } from 'node:url';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importNewlines from 'eslint-plugin-import-newlines';
import unusedImports from 'eslint-plugin-unused-imports';

const SOURCE_DIRECTORY = fileURLToPath(new URL('./src/', import.meta.url));
const LAYERS = ['app', 'screens', 'widgets', 'features', 'entities', 'shared'];
const SCREEN_GROUPS = new Set(['household', 'payment', 'banking']);

/** 경로를 정규화해 별칭이나 상대 경로로 FSD 경계를 우회하지 못하게 합니다. */
function getModuleInfo(filename) {
  const parts = relative(SOURCE_DIRECTORY, filename).split(sep);
  const [layer, folder] = parts;
  const grouped = layer === 'screens' && SCREEN_GROUPS.has(folder);
  const sliceDepth = grouped ? 3 : 2;
  const isGroup = grouped && (parts.length < sliceDepth || /^index(?:\.[cm]?[jt]sx?)?$/.test(parts[2]));
  // 그룹명만 비교하면 같은 그룹의 형제 화면이 내부 코드를 공유할 수 있으므로 최종 화면까지 식별합니다.
  const slice = isGroup ? undefined : parts.slice(1, sliceDepth).join('/');

  return {
    layer,
    slice,
    sliceDepth,
    isGroup,
    parts,
    rank: LAYERS.indexOf(layer)
  };
}

const importBoundaries = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      upperLayer: '{{source}}에서 상위 레이어 {{target}}를 참조할 수 없습니다.',
      sameLayer: '같은 레이어의 다른 슬라이스 {{target}}를 직접 참조할 수 없습니다.',
      publicApi: '{{target}}의 내부 파일 대신 슬라이스의 index.ts 공개 API를 사용하세요.',
    },
  },
  create(context) {
    const source = getModuleInfo(context.filename);

    /** 같은 슬라이스 내부 참조는 허용하고 외부 참조의 레이어와 공개 진입점을 검사합니다. */
    function checkImport(node) {
      const value = node?.value;

      if (typeof value !== 'string') return;

      let filename;

      if (value.startsWith('@/')) {
        filename = resolve(SOURCE_DIRECTORY, value.slice(2));
      } else if (value.startsWith('.')) {
        filename = resolve(dirname(context.filename), value);
      } else {
        return;
      }

      const target = getModuleInfo(filename);

      if (source.rank < 0 || target.rank < 0) return;

      // app과 shared는 슬라이스가 없고, 그 밖의 레이어는 자기 슬라이스 안에서만 자유롭게 참조합니다.
      if (source.layer === target.layer) {
        if (['app', 'shared'].includes(source.layer) || (source.slice && source.slice === target.slice)) return;

        context.report({
          node,
          messageId: 'sameLayer',
          data: {
            target: value
          }
        });
        return;
      }

      if (target.rank < source.rank) {
        context.report({
          node,
          messageId: 'upperLayer',
          data: {
            source: source.layer,
            target: target.layer
          }
        });
        return;
      }

      // shared의 모듈 구조는 슬라이스와 다르므로 슬라이스 공개 API 검사는 중간 네 레이어에만 적용합니다.
      if (['app', 'shared'].includes(target.layer)) return;

      const isPublicApi = !target.isGroup && (target.parts.length === target.sliceDepth || (
        target.parts.length === target.sliceDepth + 1 && /^index(?:\.[cm]?[jt]sx?)?$/.test(target.parts[target.sliceDepth])
      ));

      if (!isPublicApi) {
        context.report({
          node,
          messageId: 'publicApi',
          data: {
            target: value
          }
        });
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

/** 단일 진입 UI는 ui/에 직접 두고 내부 보조 컴포넌트만 컴포넌트별 폴더를 사용합니다. */
const uiFolders = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      componentFolder: '내부 보조 컴포넌트는 _components/ 바로 아래가 아닌 컴포넌트별 폴더에 배치하세요.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const parts = relative(SOURCE_DIRECTORY, context.filename).split(sep);
        const parent = parts.at(-2);
        if (!parts.includes('ui') || !/\.tsx$/.test(context.filename) || parent !== '_components') return;

        context.report({
          node,
          messageId: 'componentFolder'
        });
      }
    };
  }
};

/** 업무 타입과 실행 코드를 분리하고 API 계약이 호출 함수 안에 다시 섞이지 않게 합니다. */
const typeFiles = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      declarationFile: '업무 타입 / 인터페이스는 같은 책임의 *Types.ts 파일에 선언하세요.',
      typeOnlyFile: '*Types.ts에는 타입 선언과 import type / export type만 작성하세요.',
      apiContract: 'API의 객체 자료형은 *ApiTypes.ts에 이름을 정의하고 가져오세요.',
    },
  },
  create(context) {
    const { parts } = getModuleInfo(context.filename);
    const isTypeFile = context.filename.endsWith('Types.ts');
    const isUi = parts.includes('ui') || (parts[0] === 'app' && context.filename.endsWith('.tsx'));
    const isApi = parts.includes('api');

    /** UI의 작은 표시 타입은 허용하며 업무 타입은 전용 파일에서만 선언합니다. */
    function checkDeclaration(node) {
      if (!isTypeFile && !isUi) {
        context.report({
          node,
          messageId: 'declarationFile'
        });
      }
    }

    return {
      Program(node) {
        if (!isTypeFile) return;
        for (const statement of node.body) {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
          const isDeclaration = ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'].includes(declaration?.type);
          const isImport = statement.type === 'ImportDeclaration' && statement.importKind === 'type';
          const isExport = ['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type)
            && !statement.declaration && (statement.exportKind === 'type'
              || (statement.specifiers?.length > 0 && statement.specifiers.every((specifier) => specifier.exportKind === 'type')));
          if (isDeclaration || isImport || isExport) continue;

          context.report({
            node: statement,
            messageId: 'typeOnlyFile'
          });
        }
      },
      TSTypeAliasDeclaration: checkDeclaration,
      TSInterfaceDeclaration: checkDeclaration,
      TSTypeLiteral(node) {
        if (!isApi || isTypeFile || isUi) return;

        context.report({
          node,
          messageId: 'apiContract'
        });
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mts,mjs}'],
    plugins: {
      architecture: {
        rules: {
          'import-boundaries': importBoundaries,
          'ui-folders': uiFolders,
          'type-files': typeFiles
        }
      },
    },
    rules: {
      'architecture/import-boundaries': 'error',
      'architecture/ui-folders': 'error',
      'architecture/type-files': 'error',
      'react/jsx-one-expression-per-line': ['error', {
        allow: 'none'
      }],
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    // Next의 기본 설정에 React recommended가 포함되어 있으므로 추가 플러그인만 등록합니다.
    plugins: {
      'import-newlines': importNewlines,
      'unused-imports': unusedImports,
    },
    rules: {
      semi: 'off',
      'no-unused-vars': 'off',
      // TypeScript 기본 검사와 중복 보고하지 않고 unused-imports가 미사용 코드를 검사합니다.
      '@typescript-eslint/no-unused-vars': 'off',
      'react/display-name': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-first-prop-new-line': ['warn', 'always'],
      'react/jsx-max-props-per-line': ['warn', {
        maximum: 1
      }],
      'react/jsx-indent': ['warn', 2],
      'react/jsx-indent-props': ['warn', 2],
      'react/jsx-closing-bracket-location': ['warn', 'tag-aligned'],
      'react/jsx-curly-brace-presence': ['warn', {
        props: 'always',
        children: 'never'
      }],
      quotes: ['warn', 'single', {
        avoidEscape: true
      }],
      'object-curly-newline': ['warn', {
        ObjectExpression: {
          multiline: true,
          minProperties: 1
        },
        ObjectPattern: {
          consistent: true
        },
        ImportDeclaration: {
          multiline: true,
          minProperties: 2
        },
        ExportDeclaration: {
          multiline: true,
          minProperties: 1
        },
      }],
      'object-property-newline': ['warn', {
        allowAllPropertiesOnSameLine: false
      }],
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': ['warn', {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'import-newlines/enforce': ['warn', {
        items: 1,
        'max-len': 999
      }],
      indent: ['warn', 2],
      // 객체 줄바꿈 자동 수정이 남긴 공백도 함께 정리해 Git 차이에 서식 오류가 남지 않게 합니다.
      'no-trailing-spaces': 'warn',
    },
    settings: {
      react: {
        version: 'detect'
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.next-test/**',
    'test-results/**',
    'playwright-report/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
