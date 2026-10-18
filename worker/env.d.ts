/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    // 현재 앱은 DB를 쓰지 않는다. 바인딩이 없으면 getDb에서 오류를 알린다.
    DB?: D1Database;
  }
}
