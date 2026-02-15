const { Controller, Get, Post, Body, Inject } = require('@nestjs/common');
const { AppService } = require('./app.service');

@Controller()
export class AppController {
  constructor(@Inject(AppService) appService) {
    // Using @Inject to ensure proper dependency injection in JavaScript setup
    // without relying on TypeScript metadata reflection
    this.appService = appService;
  }

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Post('auth/login')
  async login(@Body() body) {
    const { username, password } = body;
    // Delegate to service for auth logic and DB check
    return this.appService.login(username, password);
  }
}
