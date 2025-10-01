# Lambda + API Gateway + DynamoDB (+ Cognito) Demo

A minimal serverless CRUD API built on **AWS Lambda**, **API Gateway (HTTP API)**, and **DynamoDB**. Optionally secured with **Amazon Cognito (User Pool JWT authorizer)**. No frontend required — you can test with AWS CLI and `curl`.

---

## ✨ Features

* `POST /items` – create an item
* `GET /items` – list items
* `GET /items/{id}` – fetch a single item
* `PUT /items/{id}` – update fields on an item
* `DELETE /items/{id}` – delete an item
* `GET /health` – quick health check

**File of interest:** `index.mjs` (Lambda handler)
**Env var:** `TABLE_NAME` → DynamoDB table to read/write

---

## 🧱 Architecture

```
Client (curl/Postman/AWS CLI)
      |
      v
API Gateway (HTTP API)  --(JWT verify w/ Cognito User Pool [optional])
      |
      v
AWS Lambda (Node.js)
      |
      v
Amazon DynamoDB (table: DemoItems or your table)
```

---

## 🧰 Prerequisites

* AWS account + IAM permissions to create/read:

  * DynamoDB table, Lambda function, API Gateway HTTP API
* Node.js 18+ or 20+
* AWS CLI configured (`aws configure sso` or `aws configure`)

---

## 🚀 Quick Start (Console-driven)

### 1) Create a DynamoDB table

* **DynamoDB → Tables → Create**

  * **Table name:** `DemoItems` (or your choice)
  * **Partition key:** `id` (String)

### 2) Create the Lambda function

* **Lambda → Create function** → *Author from scratch*

  * **Name:** `demoItemsFn` (or your choice)
  * **Runtime:** Node.js 18.x/20.x
  * **Execution role:** basic Lambda permissions (add DynamoDB permissions next)
* Upload/inline the contents of `index.mjs` as your handler (use `index.handler`)
* **Configuration → Environment variables**: `TABLE_NAME=DemoItems`
* **Permissions → Role → Add inline policy** (example):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "dynamodb:PutItem","dynamodb:GetItem","dynamodb:Scan",
      "dynamodb:UpdateItem","dynamodb:DeleteItem"
    ],
    "Resource": "arn:aws:dynamodb:<region>:<account-id>:table/<YourTableName>"
  }]
}
```

### 3) Create the HTTP API

* **API Gateway → Create API → HTTP API**
* **Integrations**: add your Lambda function
* **Routes**: `POST /items`, `GET /items`, `GET /items/{id}`, `PUT /items/{id}`, `DELETE /items/{id}`, `GET /health`
* Attach the Lambda integration to each route
* **Stage**: `$default` (Auto-deploy ON)

> If needed, grant API Gateway permission to invoke Lambda:
>
> ```bash
> aws lambda add-permission \
>   --region <region> \
>   --function-name demoItemsFn \
>   --statement-id apigwInvokeDemo \
>   --action lambda:InvokeFunction \
>   --principal apigateway.amazonaws.com \
>   --source-arn arn:aws:execute-api:<region>:<account-id>:<api-id>/*/*/*
> ```

### 4) (Optional) Add Cognito JWT authorizer

* **Cognito → User pools → Create**

  * Create a **public** App Client (SPA type); enable `ALLOW_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`
* **API Gateway → Your HTTP API → Authorizers → Create (JWT)**

  * **Issuer:** `https://cognito-idp.<region>.amazonaws.com/<UserPoolId>`
  * **Audience:** `<AppClientId>`
* **Routes →** set protected routes to **Authorization: JWT**, authorizer = your Cognito authorizer

### 5) Create a test user & get a token (no frontend)

```bash
# set a permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username <EMAIL_OR_USERNAME> \
  --password 'Str0ngPassw0rd!' \
  --permanent

# retrieve an ID token via USER_PASSWORD_AUTH
ID_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id <APP_CLIENT_ID> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME='<EMAIL_OR_USERNAME>',PASSWORD='Str0ngPassw0rd!' \
  --query 'AuthenticationResult.IdToken' --output text)
```

---

## 🧪 Test Requests

**Base URL:** `https://<api-id>.execute-api.<region>.amazonaws.com`

> If Cognito authorizer is attached, include `-H "Authorization: Bearer $ID_TOKEN"` in each call.

**Create**

```bash
curl -X POST "$BASE/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{"note":"hello"}'
```

**List**

```bash
curl "$BASE/items" -H "Authorization: Bearer $ID_TOKEN"
```

**Get One**

```bash
curl "$BASE/items/<id>" -H "Authorization: Bearer $ID_TOKEN"
```

**Update**

```bash
curl -X PUT "$BASE/items/<id>" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{"note":"updated"}'
```

**Delete**

```bash
curl -X DELETE "$BASE/items/<id>" -H "Authorization: Bearer $ID_TOKEN"
```

**Health**

```bash
curl "$BASE/health"
```

---

## 🗂️ Project Layout

```
.
├─ index.mjs              # Lambda handler
├─ package.json           # (optional) dependencies
├─ README.md              # this file
└─ .gitignore             # ignore node_modules, .env, *.zip, etc.
```

**Suggested `.gitignore`:**

```
node_modules/
.env
.env.*
*.zip
.DS_Store
.aws/
```

---

## 🔒 Security Notes

* `index.mjs` contains **no secrets**; it reads `TABLE_NAME` from environment variables.
* CORS is set to `*` for quick testing; **tighten in production** (specific origins, headers, and methods).
* Avoid logging sensitive request bodies in production.
* If you enable Cognito, ensure API routes require a valid JWT and **do not accept anonymous writes**.

---

## 📜 License

MIT