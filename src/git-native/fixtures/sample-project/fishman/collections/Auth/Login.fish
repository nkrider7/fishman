{
    "id": "req_login01",
    "name": "Login",
    "method": "POST",
    "url": "{{baseUrl}}/auth/login",
    "headers": [
        {
            "enabled": true,
            "key": "Content-Type",
            "value": "application/json"
        }
    ],
    "query": [],
    "body": {
        "type": "json",
        "content": "{\n  \"email\": \"dev@example.com\",\n  \"password\": \"{{password}}\"\n}\n"
    },
    "auth": {
        "type": "none"
    },
    "scripts": {
        "preRequest": "",
        "postResponse": "",
        "tests": "fishman.test(\"login returns 200\", () => {\n  fishman.expect(fishman.response.status).to.equal(200);\n});\n"
    },
    "variables": [],
    "source": {
        "kind": "manual",
        "locked": true
    },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
}
