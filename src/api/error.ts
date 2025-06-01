export interface CreateMessageError extends Error {
	status?: number
	retryDelay?: number
}
