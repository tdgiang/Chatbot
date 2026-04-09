import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs/promises';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { INDEXING_QUEUE, IndexingJob } from './documents.processor';

const ALLOWED_MIMES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INDEXING_QUEUE) private readonly queue: Queue<IndexingJob>,
  ) {}

  async upload(file: Express.Multer.File, knowledgeBaseId: string) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Only PDF, DOCX, and TXT files are allowed');
    }

    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) throw new NotFoundException('KnowledgeBase not found');

    const doc = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    await this.queue.add('index', {
      documentId: doc.id,
      filePath: file.path,
      mimeType: file.mimetype,
    });

    return doc;
  }

  async list(knowledgeBaseId?: string) {
    return this.prisma.document.findMany({
      where: knowledgeBaseId ? { knowledgeBaseId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatus(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return { id: doc.id, status: doc.status, chunkCount: doc.chunkCount, errorMessage: doc.errorMessage };
  }

  async reindex(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    const filePath = `${process.env.UPLOAD_DIR ?? './uploads'}/${doc.filename}`;

    // Delete old chunks
    await this.prisma.chunk.deleteMany({ where: { documentId: id } });

    // Reset status
    await this.prisma.document.update({
      where: { id },
      data: { status: 'PENDING', chunkCount: 0, errorMessage: null },
    });

    // Re-queue indexing job
    await this.queue.add('index', {
      documentId: doc.id,
      filePath,
      mimeType: doc.mimeType,
    });

    return { id: doc.id, status: 'PENDING' };
  }

  async remove(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    // Delete file from disk
    try {
      await fs.unlink(`${process.env.UPLOAD_DIR ?? './uploads'}/${doc.filename}`);
    } catch { /* file may not exist */ }

    await this.prisma.document.delete({ where: { id } });
    return { success: true };
  }

  async generateTemplateDocx(): Promise<Buffer> {
    const children: Paragraph[] = [
      new Paragraph({
        text: 'Tài Liệu Mẫu — Chatbot Hỗ Trợ Tuyển Sinh',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' }),

      new Paragraph({ children: [new TextRun({ text: 'HƯỚNG DẪN SOẠN TÀI LIỆU CHO CHATBOT', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '• Mỗi chủ đề dùng "Heading 2" (Ctrl+Alt+2) — AI sẽ tách đây làm ranh giới chunk.' })] }),
      new Paragraph({ children: [new TextRun({ text: '• Mỗi đoạn văn viết một ý hoàn chỉnh, tự đứng vững mà không cần ngữ cảnh xung quanh.' })] }),
      new Paragraph({ children: [new TextRun({ text: '• Lặp lại tên chủ đề trong mỗi đoạn (ví dụ: "Điều kiện sức khỏe của CSND yêu cầu...").' })] }),
      new Paragraph({ children: [new TextRun({ text: '• Tránh bảng phức tạp, hình ảnh, biểu đồ — chỉ text mới được index.' })] }),
      new Paragraph({ children: [new TextRun({ text: '• File hỗ trợ: PDF, DOCX, TXT. Tối đa 10 MB.' })] }),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: '─────────────────────────────────────────', color: 'AAAAAA' })] }),
      new Paragraph({ text: '' }),

      // Section 1
      new Paragraph({ text: 'Giới Thiệu Học Viện CSND', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Học viện Cảnh sát nhân dân (CSND) là cơ sở đào tạo bậc đại học và sau đại học trực thuộc Bộ Công an, được thành lập năm 1968. Học viện đào tạo cán bộ cho ngành Công an trong các lĩnh vực điều tra hình sự, kinh tế, phòng cháy chữa cháy và luật.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Học viện CSND có trụ sở tại Hà Nội và TP.HCM, với đội ngũ giảng viên trên 500 người, trong đó có hơn 100 giáo sư, phó giáo sư và tiến sĩ.' })] }),
      new Paragraph({ text: '' }),

      // Section 2
      new Paragraph({ text: 'Điều Kiện Sức Khỏe Tuyển Sinh', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Điều kiện sức khỏe tuyển sinh vào Học viện CSND và các trường Công an nhân dân yêu cầu thí sinh đạt loại 1 hoặc loại 2 theo tiêu chuẩn của Bộ Công an.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Đối với nam: chiều cao tối thiểu 1m64, cân nặng từ 53 kg trở lên, thị lực không kính đạt 8/10 mỗi mắt.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Đối với nữ: chiều cao tối thiểu 1m58, cân nặng từ 48 kg trở lên, thị lực không kính đạt 7/10 mỗi mắt.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Thí sinh không được mắc các bệnh mãn tính, bệnh lây nhiễm, dị tật bẩm sinh ảnh hưởng đến khả năng công tác.' })] }),
      new Paragraph({ text: '' }),

      // Section 3
      new Paragraph({ text: 'Hồ Sơ Đăng Ký Tuyển Sinh', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Hồ sơ tuyển sinh vào các trường CSND bao gồm: đơn xin dự tuyển theo mẫu Bộ Công an, phiếu đăng ký tuyển sinh in từ hệ thống, bản sao có chứng thực CCCD/CMND, bằng tốt nghiệp THPT và học bạ.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Ngoài ra cần bổ sung: lý lịch tự khai có xác nhận địa phương, giấy khai sinh bản sao chứng thực, giấy khám sức khỏe do cơ sở y tế được Bộ Công an chỉ định cấp.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Thí sinh nộp hồ sơ tại Công an tỉnh/thành phố nơi đăng ký hộ khẩu thường trú trong thời gian từ tháng 3 đến tháng 4 hằng năm.' })] }),
      new Paragraph({ text: '' }),

      // Section 4
      new Paragraph({ text: 'Ngành Đào Tạo Và Chỉ Tiêu', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Học viện CSND tuyển sinh các ngành: An ninh điều tra (8310301), Cảnh sát kinh tế (8310302), Cảnh sát hình sự (8310303), Cảnh sát phòng cháy và chữa cháy (8310304), Luật — hệ dân sự (7380101).' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Chỉ tiêu tuyển sinh hàng năm khoảng 1.500 sinh viên hệ chính quy, trong đó hệ dân sự chiếm khoảng 15%. Điểm chuẩn dao động từ 25 đến 29 điểm tùy ngành và khu vực.' })] }),
      new Paragraph({ text: '' }),

      // Section 5
      new Paragraph({ text: 'Học Phí Và Chế Độ Đãi Ngộ', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: 'Sinh viên hệ công an nhân dân được miễn học phí hoàn toàn, được cấp trang phục, chỗ ở ký túc xá và sinh hoạt phí hàng tháng theo quy định của Bộ Công an.' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Sinh viên hệ dân sự đóng học phí theo khung quy định của nhà nước, hiện khoảng 15–18 triệu đồng/năm và không được hưởng các chế độ đặc thù của ngành công an.' })] }),
    ];

    const doc = new DocxDocument({ sections: [{ children }] });
    return Buffer.from(await Packer.toBuffer(doc));
  }
}
