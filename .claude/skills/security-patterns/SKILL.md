---
name: security-patterns
description: Provides security best practices for authentication, input validation, and vulnerability prevention. Use when implementing authentication, preventing XSS attacks, adding CSRF protection, validating user input, securing password storage, or preventing SQL injection.
category: security
framework: [generic]
---

# Security Patterns Skill

<role>
Security expert and consultant. Provides guidance on authentication, authorization, input validation, and threat prevention.
</role>

<mission>
Ensure all applications follow security best practices and are protected against common vulnerabilities (OWASP Top 10).
</mission>

<core-expertise>
  <domain>Authentication and authorization</domain>
  <domain>Input validation and sanitization</domain>
  <domain>XSS and CSRF prevention</domain>
  <domain>Secret management</domain>
  <domain>SQL injection prevention</domain>
  <domain>HTTPS and secure communication</domain>
  <domain>Security headers</domain>
  <domain>RBAC implementation</domain>
</core-expertise>

<critical-rules>
  <forbidden priority="absolute">
    <rule>Never hardcode secrets or credentials in code</rule>
    <rule>Never trust user input without validation</rule>
    <rule>Never concatenate SQL queries directly</rule>
    <rule>Never store passwords in plain text</rule>
    <rule>Never expose sensitive data in logs or errors</rule>
  </forbidden>

  <mandatory priority="absolute">
    <rule>Always validate and sanitize user input</rule>
    <rule>Always use parameterized queries or ORMs</rule>
    <rule>Always hash passwords with bcrypt or Argon2</rule>
    <rule>Always use HTTPS in production</rule>
    <rule>Always implement authentication and authorization checks</rule>
  </mandatory>
</critical-rules>

<threat-categories>
  <category name="injection-attacks">
    <threat type="sql-injection">
      <description>Malicious SQL code injection through user input</description>
      <prevention>Use parameterized queries, ORMs, or Zod validation</prevention>
      <severity>Critical</severity>
    </threat>
    <threat type="nosql-injection">
      <description>MongoDB query injection through unsanitized input</description>
      <prevention>Validate input types, use query builders</prevention>
      <severity>High</severity>
    </threat>
  </category>

  <category name="xss-attacks">
    <threat type="stored-xss">
      <description>Malicious scripts stored in database and executed on render</description>
      <prevention>Sanitize HTML with DOMPurify, use Content Security Policy</prevention>
      <severity>Critical</severity>
    </threat>
    <threat type="reflected-xss">
      <description>Malicious scripts reflected from URL parameters</description>
      <prevention>Validate and encode output, escape user input</prevention>
      <severity>High</severity>
    </threat>
  </category>

  <category name="csrf-attacks">
    <threat type="csrf">
      <description>Unauthorized actions performed on behalf of authenticated users</description>
      <prevention>Use CSRF tokens, SameSite cookies, verify Origin headers</prevention>
      <severity>High</severity>
    </threat>
  </category>

  <category name="authentication-attacks">
    <threat type="credential-stuffing">
      <description>Automated attempts using leaked credentials</description>
      <prevention>Rate limiting, multi-factor authentication, password strength requirements</prevention>
      <severity>High</severity>
    </threat>
    <threat type="session-hijacking">
      <description>Stealing or guessing session tokens</description>
      <prevention>Secure cookies, HttpOnly flag, short token lifetime</prevention>
      <severity>Critical</severity>
    </threat>
  </category>

  <category name="authorization-attacks">
    <threat type="privilege-escalation">
      <description>Users accessing resources beyond their permissions</description>
      <prevention>OpenFGA authorization checks, row-level security</prevention>
      <severity>Critical</severity>
    </threat>
    <threat type="idor">
      <description>Direct object reference manipulation in URLs/requests</description>
      <prevention>Authorization checks on every resource access</prevention>
      <severity>High</severity>
    </threat>
  </category>
</threat-categories>

## Security Patterns

<pattern name="input-validation">
  <purpose>Validate all user input before processing</purpose>
  <technology>Zod validation schema</technology>
  <when-to-use>All API endpoints, form submissions, query parameters</when-to-use>

  <example>
```typescript
import { z } from 'zod';

const UserSchema = z.object({
email: z.string().email(),
password: z.string().min(8).max(100),
name: z.string().min(1).max(255),
});

function validateUser(data: unknown): User {
return UserSchema.parse(data); // Throws if invalid
}

````
  </example>
</pattern>

<pattern name="xss-prevention">
  <purpose>Sanitize HTML content to prevent XSS attacks</purpose>
  <technology>DOMPurify library</technology>
  <when-to-use>User-generated HTML, rich text editors, custom page content</when-to-use>

  <example>
```typescript
import DOMPurify from 'dompurify';

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong'],
    ALLOWED_ATTR: [],
  });
}
````

  </example>
</pattern>

<pattern name="csrf-protection">
  <purpose>Prevent cross-site request forgery attacks</purpose>
  <technology>CSRF tokens in Angular interceptors</technology>
  <when-to-use>All state-changing requests (POST, PUT, DELETE)</when-to-use>

  <example>
```typescript
@Injectable()
export class CsrfInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.csrfService.getToken();

    const secureReq = req.clone({
      headers: req.headers.set('X-CSRF-Token', token),
    });

    return next.handle(secureReq);

}
}

````
  </example>
</pattern>

<pattern name="secret-management">
  <purpose>Secure storage and access of sensitive credentials</purpose>
  <technology>Environment variables, AWS Secrets Manager</technology>
  <when-to-use>API keys, database credentials, encryption keys</when-to-use>

  <example>
```typescript
// ❌ Never hardcode secrets
const apiKey = 'sk_live_1234567890';

// ✅ Use environment variables
const apiKey = process.env.API_KEY;

// ✅ Validate secrets exist
if (!process.env.API_KEY) {
  throw new Error('API_KEY environment variable is required');
}
````

  </example>
</pattern>

<pattern name="password-hashing">
  <purpose>Securely store user passwords</purpose>
  <technology>bcrypt or Argon2</technology>
  <when-to-use>User registration, password changes</when-to-use>

  <example>
```typescript
import * as bcrypt from 'bcrypt';

async function hashPassword(password: string): Promise<string> {
const saltRounds = 12;
return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
return bcrypt.compare(password, hash);
}

````
  </example>
</pattern>

<pattern name="sql-injection-prevention">
  <purpose>Prevent SQL injection attacks</purpose>
  <technology>TypeORM parameterized queries</technology>
  <when-to-use>All database queries with user input</when-to-use>

  <example>
```typescript
// ❌ Never concatenate SQL
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Use parameterized queries
const user = await repository.findOne({
  where: { email }
});

// ✅ Or query builder with parameters
const users = await repository
  .createQueryBuilder('user')
  .where('user.email = :email', { email })
  .getMany();
````

  </example>
</pattern>

<pattern name="rate-limiting">
  <purpose>Prevent brute force and DoS attacks</purpose>
  <technology>NestJS Throttler module</technology>
  <when-to-use>Login endpoints, API endpoints, sensitive operations</when-to-use>

  <example>
```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
@Post('login')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
async login(@Body() credentials: LoginDto) {
// Login logic
}
}

````
  </example>
</pattern>

<pattern name="security-headers">
  <purpose>Add security headers to HTTP responses</purpose>
  <technology>Helmet middleware</technology>
  <when-to-use>All HTTP responses</when-to-use>

  <example>
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
````

  </example>
</pattern>

## Best Practices

<best-practices>
  <practice category="validation">
    <action>Validate all user input</action>
    <implementation>Use Zod schemas for all API endpoints</implementation>
  </practice>

  <practice category="sanitization">
    <action>Sanitize HTML content</action>
    <implementation>Use DOMPurify before rendering user content</implementation>
  </practice>

  <practice category="encryption">
    <action>Use HTTPS everywhere</action>
    <implementation>Enforce SSL/TLS in production, redirect HTTP to HTTPS</implementation>
  </practice>

  <practice category="csrf">
    <action>Implement CSRF protection</action>
    <implementation>Use CSRF tokens for state-changing operations</implementation>
  </practice>

  <practice category="sql-safety">
    <action>Use parameterized queries</action>
    <implementation>Never concatenate SQL strings, use TypeORM query builders</implementation>
  </practice>

  <practice category="password-storage">
    <action>Store passwords hashed</action>
    <implementation>Use bcrypt with minimum 12 rounds</implementation>
  </practice>

  <practice category="rate-limiting">
    <action>Implement rate limiting</action>
    <implementation>Use @nestjs/throttler for API endpoints</implementation>
  </practice>

  <practice category="headers">
    <action>Use security headers</action>
    <implementation>Configure Helmet middleware with CSP, HSTS, etc.</implementation>
  </practice>

  <practice category="logging">
    <action>Log security events</action>
    <implementation>Log authentication failures, authorization denials, suspicious activity</implementation>
  </practice>

  <practice category="auditing">
    <action>Regular security audits</action>
    <implementation>Periodic dependency updates, vulnerability scans, code reviews</implementation>
  </practice>
</best-practices>

## Security Checklist

<verification-checklist>
  <check category="input">
    <item>Input validation implemented (Zod schemas)</item>
    <item>Output encoding/sanitization (DOMPurify)</item>
  </check>

  <check category="authentication">
    <item>Authentication required for protected routes</item>
    <item>Passwords hashed with bcrypt (12+ rounds)</item>
    <item>Rate limiting on auth endpoints</item>
  </check>

  <check category="authorization">
    <item>Authorization checked (OpenFGA guards)</item>
    <item>Row-level security for multi-tenancy</item>
  </check>

  <check category="attack-prevention">
    <item>CSRF tokens used for state changes</item>
    <item>SQL injection prevented (parameterized queries)</item>
    <item>XSS prevented (sanitized HTML)</item>
  </check>

  <check category="infrastructure">
    <item>Secrets not in code (environment variables)</item>
    <item>HTTPS enforced in production</item>
    <item>Security headers set (Helmet)</item>
  </check>

  <check category="monitoring">
    <item>Security events logged</item>
    <item>Error messages don't expose sensitive data</item>
  </check>
</verification-checklist>

<activation-triggers>
  <keyword>security</keyword>
  <keyword>authentication</keyword>
  <keyword>authorization</keyword>
  <keyword>validation</keyword>
  <keyword>XSS</keyword>
  <keyword>CSRF</keyword>
  <keyword>SQL injection</keyword>
  <keyword>secrets</keyword>
  <keyword>vulnerability</keyword>
  <keyword>RBAC</keyword>
  <keyword>permissions</keyword>
  <keyword>threat</keyword>
  <keyword>attack</keyword>
  <keyword>exploit</keyword>
</activation-triggers>
