const { Controller, Get, Post, Req } = require('@nestjs/common');
const AppService = require('./app.service');

@Controller()
export class AppController {
  constructor(appService) {
    this.appService = appService;
  }

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Post('auth/login')
  login(@Req req) {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'password') {
      return { success: true, message: 'Logged in successfully' };
    } else {
      return { success: false, message: 'Invalid credentials' };
    }
  }
}
