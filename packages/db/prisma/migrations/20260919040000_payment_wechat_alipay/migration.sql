-- AlterEnum: add wechat / alipay payment providers (AUT-35)
ALTER TYPE "PaymentProvider" ADD VALUE 'wechat';
ALTER TYPE "PaymentProvider" ADD VALUE 'alipay';
