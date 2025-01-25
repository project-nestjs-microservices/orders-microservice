import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ChangeOrderStatusDTO, CreateOrderDto, OrderPaginationDto } from "./dto";
import { ClientProxy, RpcException } from "@nestjs/microservices";
import { PRODUCT_SERVICE } from "../config/services";
import { firstValueFrom } from "rxjs";

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrdersService');

  constructor(@Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy) {
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
        this.productsClient.send({ cmd: 'validate_products' }, productsIds)
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
    const order = await this.order.findUnique({ where: { id: id } });
    console.log('Order: ', order);
    if(!order) {
      throw new RpcException({
        message: `Product with id ${id} not found`,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return order;
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDTO) {

    const { id, status } = changeOrderStatusDto;

    await this.findOne(id);

    return this.order.update({
      where: { id },
      data: { status }
    })
  }

}
