import { HttpStatus, Injectable, Logger, OnModuleInit, ParseUUIDPipe } from "@nestjs/common";
import { OrderStatus, PrismaClient } from "@prisma/client";
import { ChangeOrderStatusDTO, CreateOrderDto, OrderPaginationDto } from "./dto";
import { RpcException } from "@nestjs/microservices";

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect()
    this.logger.log('Database connected')
  }

  create(createOrderDto: CreateOrderDto) {
    return this.order.create({
      data: createOrderDto,
    })
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
