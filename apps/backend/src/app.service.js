const { Injectable, Inject } = require('@nestjs/common');

@Injectable()
export class AppService {
  constructor(@Inject('DATABASE_CONNECTION') db) {
    this.db = db;
  }

  getHello() {
    return 'Hello World!';
  }

  login(username, password) {
    // Wrap sqlite callback in Promise for async/await compatibility
    return new Promise((resolve) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ? AND password = ?',
        [username, password],
        (err, row) => {
          if (err) {
            resolve({ success: false, message: 'Error' });
          } else if (row) {
            resolve({ success: true, message: 'Logged in successfully' });
          } else {
            resolve({ success: false, message: 'Invalid credentials' });
          }
        },
      );
    });
  }
}
