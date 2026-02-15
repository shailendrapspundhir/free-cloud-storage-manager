const { Module } = require('@nestjs/common');
const { AppController } = require('./app.controller');
const { AppService } = require('./app.service');

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database('./users.db');
        db.serialize(() => {
          db.run('CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)');
          db.run("INSERT OR IGNORE INTO users VALUES ('admin', 'password')");
        });
        return db;
      },
    },
  ],
})
export class AppModule {}
