import sql from "mssql";

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER ?? "", // e.g. "myserver.database.windows.net"
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
};

export class SQLClient {
  private static pool: sql.ConnectionPool | null = null;

  private static async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool) return this.pool;

    const pool = new sql.ConnectionPool(config);

    pool.on("error", (err) => {
      // If the pool becomes unhealthy, drop it so it can be recreated on next query
      console.error("❌ [SQL] Pool error:", err);
      this.pool = null;
    });

    console.log("🛢️  [SQL] Creating connection pool...");
    this.pool = await pool.connect();
    return this.pool;
  }

  static async query<T = unknown>(
    queryText: string,
    params: Record<string, unknown> = {}
  ): Promise<sql.IResult<T>> {
    const pool = await this.getPool();
    const request = pool.request();

    for (const [key, value] of Object.entries(params)) {
      // Handle undefined as null to avoid driver errors
      request.input(key, value === undefined ? null : (value as any));
    }

    return request.query<T>(queryText);
  }
}