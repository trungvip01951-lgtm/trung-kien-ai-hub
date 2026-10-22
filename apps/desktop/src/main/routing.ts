import type { AgentDefinition, Options } from "@anthropic-ai/claude-agent-sdk";

// Tự chia việc theo đúng sức (anh Trung yêu cầu 22/10/2026): trong cùng một việc, AI chính giao từng phần
// cho AI phụ có model và mức suy nghĩ hợp với phần đó (Agent SDK: `agents`, mỗi AI phụ có `model`, `effort`).
// Chi phí của AI phụ vẫn tính vào việc và vào hạn mức như bình thường.

export const ROUTED_AGENTS: Record<string, AgentDefinition> = {
  "tro-ly-co-hoc": {
    description: "Việc cơ học, không cần phán đoán: đọc/tìm tệp, liệt kê, đếm, lọc, chép, đổi định dạng, tóm tắt máy móc nội dung tệp. Rẻ và nhanh nhất.",
    prompt: "Bạn làm việc cơ học được giao: làm đúng, đủ, không suy diễn thêm. Trả về kết quả gọn, ghi rõ tệp/nguồn. Không bịa số liệu; thiếu thì ghi \"chưa đọc được\". Trả lời tiếng Việt.",
    model: "claude-haiku-5-5",
  },
  "tro-ly-thuc-thi": {
    description: "Làm theo yêu cầu đã rõ: viết hoặc sửa mã theo thiết kế có sẵn, soạn nội dung theo dàn ý, chạy và sửa theo kết quả kiểm thử.",
    prompt: "Bạn thực hiện phần việc đã có yêu cầu rõ. Làm đúng phạm vi, kiểm lại kết quả trước khi báo. Không bịa số liệu. Trả lời tiếng Việt.",
    model: "claude-sonnet-5-5",
    effort: "medium",
  },
  "tro-ly-phan-tich": {
    description: "Việc cần phán đoán: phân tích, thiết kế, tìm nguyên nhân lỗi khó, viết nội dung quan trọng cho khách, nghiệm thu/kiểm tra độc lập kết quả.",
    prompt: "Bạn xử lý phần việc cần phán đoán kỹ. Tách rõ điều đo được và điều suy ra, nêu bằng chứng. Không bịa số liệu. Trả lời tiếng Việt.",
    model: "claude-opus-5-5",
    effort: "high",
  },
};

export const ROUTING_GUIDE = [
  "Chia việc theo đúng sức để tiết kiệm nhưng vẫn chính xác nhất:",
  "- Phần cơ học (đọc, tìm, đếm, lọc, chép, đổi định dạng) → giao AI phụ tro-ly-co-hoc.",
  "- Phần làm theo yêu cầu đã rõ (viết/sửa mã theo thiết kế, soạn theo dàn ý) → tro-ly-thuc-thi.",
  "- Phần cần phán đoán (phân tích, thiết kế, lỗi khó, nghiệm thu) → tro-ly-phan-tich.",
  "- Việc nhỏ làm trực tiếp được trong vài bước thì tự làm, không giao (giao việc cũng tốn token).",
  "- Phần mà AI rẻ làm xong phải kiểm lại toàn bộ thì giao thẳng AI mạnh hơn.",
  "- Mỗi lần giao: ghi rõ mục tiêu, tệp liên quan, kết quả cần trả về; chỉ đưa bối cảnh cần thiết.",
].join("\n");

// Lời dặn hệ thống cho AI chính: phần chia việc (nếu bật) + hướng dẫn dự án anh Trung soạn trong app.
export function buildSystemPrompt(projectInstructions: string, autoRouting: boolean, extraGuide = ""): Options["systemPrompt"] | undefined {
  const parts: string[] = [];
  if (autoRouting) parts.push(ROUTING_GUIDE);
  if (extraGuide) parts.push(extraGuide);
  const ins = projectInstructions.trim();
  if (ins) parts.push(`Hướng dẫn dự án (anh Trung đặt trong Trung Kiên AI Hub, áp dụng cho mọi việc của dự án này):\n${ins}`);
  if (!parts.length) return undefined;
  // snapshot: false để sửa hướng dẫn thì hội thoại đang dở cũng theo bản mới ngay.
  return { type: "custom", prompt: parts.join("\n\n"), snapshot: false };
}
