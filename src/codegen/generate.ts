import { toEffectiveRequest } from "./effective-request";
import type { GenerateCodeInput, CodegenGenerator } from "./types";
import {
  generateCurl,
  generateHttpie,
  generateWget,
} from "./targets/shell";
import {
  generateJsAxios,
  generateJsFetch,
  generateJsJquery,
  generateJsXhr,
} from "./targets/javascript";
import {
  generateNodeAxios,
  generateNodeFetch,
  generateNodeNativeHttp,
} from "./targets/nodejs";
import {
  generatePythonHttpClient,
  generatePythonRequests,
} from "./targets/python";
import { generateGoNetHttp } from "./targets/go";
import { generateJavaOkHttp } from "./targets/java";
import { generateCsharpHttpClient } from "./targets/csharp";
import { generatePhpCurl } from "./targets/php";
import { generateRubyNetHttp } from "./targets/ruby";
import { generateRustReqwest } from "./targets/rust";

const GENERATORS: Record<string, Record<string, CodegenGenerator>> = {
  shell: {
    curl: generateCurl,
    httpie: generateHttpie,
    wget: generateWget,
  },
  javascript: {
    fetch: generateJsFetch,
    axios: generateJsAxios,
    xhr: generateJsXhr,
    jquery: generateJsJquery,
  },
  nodejs: {
    fetch: generateNodeFetch,
    axios: generateNodeAxios,
    "native-http": generateNodeNativeHttp,
  },
  python: {
    requests: generatePythonRequests,
    "http-client": generatePythonHttpClient,
  },
  go: {
    "net-http": generateGoNetHttp,
  },
  java: {
    okhttp: generateJavaOkHttp,
  },
  csharp: {
    httpclient: generateCsharpHttpClient,
  },
  php: {
    curl: generatePhpCurl,
  },
  ruby: {
    "net-http": generateRubyNetHttp,
  },
  rust: {
    reqwest: generateRustReqwest,
  },
};

export function generateCode(
  draft: GenerateCodeInput["draft"],
  variables: Record<string, string>,
  options: GenerateCodeInput["options"],
): string {
  const effective = toEffectiveRequest(
    draft,
    variables,
    options.interpolateVariables,
  );

  const generator =
    GENERATORS[options.languageId]?.[options.clientId] ??
    GENERATORS.shell?.curl;

  if (!generator) {
    return `// No generator for ${options.languageId}/${options.clientId}`;
  }

  return generator(effective);
}

export { toEffectiveRequest } from "./effective-request";
export type {
  GenerateCodeOptions,
  EffectiveRequest,
  CodegenLanguage,
} from "./types";
