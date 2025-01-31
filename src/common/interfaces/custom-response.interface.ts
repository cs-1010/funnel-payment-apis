export class CustomResponse<T> {
    constructor(
        public data: T,
        public message = "Operation successful",
        public statusCode = 200,
    ) { }
}

