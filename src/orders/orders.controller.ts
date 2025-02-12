import { Controller } from "@nestjs/common";
import {EventPattern, MessagePattern, Payload} from "@nestjs/microservices";
import { OrdersService } from './orders.service';
import {ChangeOrderStatusDTO, CreateOrderDto, OrderPaginationDto, PaidOrderDTO} from "./dto";

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  async create(@Payload() createOrderDto: CreateOrderDto) {
    const order =  await this.ordersService.create(createOrderDto);
    const paymentSession = await this.ordersService.createPaymentSession(order)

    return {
      order,
      paymentSession,
    }
  }

  @MessagePattern('findAllOrders')
  findAll(@Payload() paginationDto: OrderPaginationDto) {
    return this.ordersService.findAll(paginationDto);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  changeOrderStatus(@Payload() changeOrderStatusDto: ChangeOrderStatusDTO ) {
    return this.ordersService.changeStatus(changeOrderStatusDto);
  }

  @EventPattern('payment.succeeded')
  paidOrder(@Payload() paidOrderDto: PaidOrderDTO){
    console.log("Paid Order Dto: ", paidOrderDto);
    return this.ordersService.paidOrder(paidOrderDto);
  }

}
