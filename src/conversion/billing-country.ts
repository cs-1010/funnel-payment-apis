import { BadRequestException } from '@nestjs/common';

export function normalizeBillingCountry(value?: string | null): 'US' | 'CA' {
  const country = value?.trim().toLowerCase();
  if (!country) return 'US';
  if (['us', 'usa', 'united states', 'united states of america'].includes(country)) return 'US';
  if (['ca', 'canada'].includes(country)) return 'CA';
  throw new BadRequestException('billingCountry must be United States (US) or Canada (CA)');
}
