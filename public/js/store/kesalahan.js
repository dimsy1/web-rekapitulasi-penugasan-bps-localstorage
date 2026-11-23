/** Kesalahan API dengan bentuk yang sama untuk mode lokal maupun server. */
export class ApiError extends Error {
  constructor(status, pesan, errors = null, data = null) {
    super(pesan);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

export function keApiError(kesalahan) {
  if (kesalahan instanceof ApiError) return kesalahan;
  const pesan = kesalahan?.message || 'Terjadi kesalahan yang tidak diketahui.';
  return new ApiError(0, pesan, null, null);
}
