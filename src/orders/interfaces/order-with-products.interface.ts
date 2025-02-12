import {OrderStatus} from "@prisma/client";

export interface OrderWithProducts {
    OrderItem: {
        name: any
        productId: number
        quantity: number
        price: number
    }[]
    status: OrderStatus
    id: string
    totalAmount: number
    totalItems: number
    paid: boolean
    paidAt: Date | null
    createdAt: Date
    updatedAt: Date
}