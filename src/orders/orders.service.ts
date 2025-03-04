import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {ChangeOrderStatusDTO, CreateOrderDto, OrderPaginationDto, PaidOrderDTO} from "./dto";
import { ClientProxy, RpcException } from "@nestjs/microservices";
import { NATS_SERVICE } from "../config";
import {catchError, firstValueFrom} from "rxjs";
import {OrderWithProducts} from "./interfaces/order-with-products.interface";

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrdersService');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('Database connected')
  }

  async create(createOrderDto: CreateOrderDto) {

    try {
      //1. Confirmar que los productos existan
      const productsIds = createOrderDto.items.map(item => item.productId)
      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productsIds)
      )

      //2. Calculos de los valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(product => product.id === orderItem.productId).price
        return (price * orderItem.quantity) + acc
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0)

      //3. Crear una transaccion de base de datos
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: { // Esto viene del nuevo modelo anadido en el schema de prisma.
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(product => product.id === orderItem.productId).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            }
          }
        }
      })

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(product => product.id === orderItem.productId).name,
        })),
      }

    } catch (error) {
      console.log('Error', error.message);
      throw new RpcException({
        status: error.status ?? HttpStatus.BAD_REQUEST,
        message: error.message ?? "Check logs on create order service"
      })
    }
  }

  async findAll(paginationDto: OrderPaginationDto) {

    const { page, limit, status } = paginationDto;

    const totalPages = await this.order.count({ where: { status } });
    const lastPage = Math.ceil(totalPages / limit);

    return {
      data: await this.order.findMany({
        where: {
          status: status,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      meta: {
        page: page,
        total: totalPages,
        lastPage: lastPage,
      }
    }
  }

  async findOne(id: string) {
    try {
      const order = await this.order.findUnique({
        where: { id: id },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            }
          }
        }
      });

      if(!order) {
        throw new RpcException({
          message: `Product with id ${id} not found`,
          status: HttpStatus.BAD_REQUEST,
        });
      }

      const productsIds = order.OrderItem.map(orderItem => orderItem.productId);
      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productsIds)
      );

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(product => product.id === orderItem.productId).name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        status: error.status ?? HttpStatus.BAD_REQUEST,
        message: error.message ?? "Error in findOne - Orders"
      })
    }
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDTO) {

    const { id, status } = changeOrderStatusDto;

    await this.findOne(id);

    return this.order.update({
      where: { id },
      data: { status }
    })
  }

  async createPaymentSession(order: OrderWithProducts) {

    return await firstValueFrom(
        this.client.send('create.payment.session', {
          orderId: order.id,
          currency: 'usd',
          items: order.OrderItem.map( item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          }))
        })
    )
  }

  async paidOrder( paidOrderDto: PaidOrderDTO ) {

    console.log('Paid Order Dto ----->')
    console.log(paidOrderDto);

    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,

        // Relation
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          }
        }
      }
    })

  }

}
