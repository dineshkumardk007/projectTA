import { z } from 'zod';

/** Shared request schemas. Client and server validate against the same rules. */

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'That password is too long.');

/** Indian mobile numbers, stored normalised as 10 digits. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^\d]/g, '').replace(/^(?:0|91)(?=\d{10}$)/, ''))
  .refine((value) => /^[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit mobile number.');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const selectedOptionSchema = z.object({
  groupId: z.string().min(1),
  optionIds: z.array(z.string().min(1)),
});

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selections: z.array(selectedOptionSchema).default([]),
});

export const placeOrderSchema = z
  .object({
    shopId: z.string().min(1),
    items: z.array(cartItemSchema).default([]),
    paymentMethod: z.enum(['CASH_ON_PICKUP', 'ONLINE', 'UPI_FULL', 'UPI_DEPOSIT']),
    customerNote: z.string().trim().max(280).optional(),
    customerLocation: coordinatesSchema.optional(),
    isCustomList: z.boolean().optional().default(false),
    customListText: z.string().trim().max(1000).optional(),
    slipImageUrl: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.isCustomList) {
        return Boolean((data.customListText && data.customListText.length > 0) || data.slipImageUrl);
      }
      return data.items.length > 0;
    },
    {
      message: 'Please add items to your cart or enter your shopping list text.',
      path: ['customListText'],
    },
  );
