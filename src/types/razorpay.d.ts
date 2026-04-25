export {};

declare global {
  interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface RazorpayCheckoutOptions {
    key: string;
    order_id: string;
    amount?: number;
    currency?: string;
    name?: string;
    description?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    notes?: Record<string, string>;
    theme?: { color?: string };
    handler: (response: RazorpaySuccessResponse) => void;
    modal?: { ondismiss?: () => void };
  }

  interface RazorpayInstance {
    open: () => void;
  }

  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

