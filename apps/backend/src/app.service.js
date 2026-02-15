const { Injectable } = require('@nestjs/common');

@Injectable()
export class AppService {
  getHello() {
    return 'Hello World!';
  }
}
