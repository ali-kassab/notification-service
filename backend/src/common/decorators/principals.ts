import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppRequest } from '../types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().user,
);

export const CurrentProject = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().project,
);

export const CurrentEndUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().endUser,
);
