export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  /** Which script tab this template is meant for */
  tab: "preRequest" | "postResponse" | "tests" | "any";
  code: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "echo-pre-request",
    name: "Echo: set header + JSON body",
    description: "Pre-request for https://httpbin.org/post or echo servers",
    tab: "preRequest",
    code: `fm.request.setHeader("X-Fishman", "hello");
fm.request.setBody({ name: "Fishman", ok: true });
console.log("Pre-request ready", fm.request.url);`,
  },
  {
    id: "echo-tests",
    name: "Echo: assert status + body",
    description: "Tests for httpbin.org/post or /headers",
    tab: "tests",
    code: `fm.test("Status is 200", () => {
  fm.response.to.have.status(200);
});

fm.test("Got JSON response", () => {
  const data = fm.response.json();
  fm.expect(data).to.be.a("object");
  console.log(data);
});`,
  },
  {
    id: "httpbin-headers",
    name: "httpbin: assert echoed header",
    description: "GET https://httpbin.org/headers — proves setHeader worked",
    tab: "any",
    code: `// Pre Request:
// fm.request.setHeader("X-Fishman", "hello");
//
// Tests:
fm.test("Status is 200", () => {
  fm.response.to.have.status(200);
});

fm.test("Echoed X-Fishman header", () => {
  const data = fm.response.json();
  fm.expect(data.headers["X-Fishman"]).to.eql("hello");
});`,
  },
  {
    id: "save-jwt",
    name: "Save JWT Token",
    description: "Extract JWT from response and save to environment",
    tab: "postResponse",
    code: `if (fm.response.status === 200) {
  const contentType = fm.response.getHeader("content-type") ?? "";
  if (!contentType.includes("json")) {
    console.error("Response is not JSON (content-type: " + contentType + ")");
  } else {
    const data = fm.response.json();
    const token = data?.token ?? data?.access_token ?? data?.data?.session?.access_token;
    if (token) {
      fm.environment.set("authToken", token);
      console.log("Saved authToken");
    } else {
      console.error("Token not found in response");
    }
  }
}`,
  },
  {
    id: "status-test",
    name: "Status Test",
    description: "Assert response status is 200",
    tab: "tests",
    code: `fm.test("Status is 200", () => {
  fm.response.to.have.status(200);
});`,
  },
  {
    id: "json-body-test",
    name: "JSON Body Test",
    description: "Assert response is valid JSON",
    tab: "tests",
    code: `fm.test("Response is JSON", () => {
  fm.expect(fm.response.json()).to.be.a("object");
});`,
  },
  {
    id: "response-time",
    name: "Response Time Test",
    description: "Assert response time is below threshold",
    tab: "tests",
    code: `fm.test("Response time below 500ms", () => {
  fm.response.to.have.responseTimeBelow(500);
});`,
  },
  {
    id: "bearer-auth",
    name: "Set Bearer Auth",
    description: "Set Authorization header from environment variable",
    tab: "preRequest",
    code: `const token = fm.environment.get("authToken");
if (token) {
  fm.request.setHeader("Authorization", \`Bearer \${token}\`);
}`,
  },
  {
    id: "random-email",
    name: "Random Email Variable",
    description: "Set a random email using dynamic variable",
    tab: "preRequest",
    code: `fm.variables.set("email", "{{$randomEmail}}");`,
  },
  {
    id: "uuid",
    name: "Generate UUID",
    description: "Set a UUID variable before request",
    tab: "preRequest",
    code: `fm.variables.set("requestId", "{{$uuid}}");`,
  },
  {
    id: "async-request",
    name: "Async Nested Request",
    description: "Send a nested request and use its response",
    tab: "preRequest",
    code: `const login = await fm.sendRequest({
  url: fm.variables.replaceIn("{{baseUrl}}/auth/login"),
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "secret" }),
});

fm.environment.set("authToken", login.json().token);`,
  },
];
