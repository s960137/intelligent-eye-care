import dlib
import cv2

# 初始化 dlib 的人臉檢測器和特徵點檢測器
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# 使用攝像頭捕獲視頻
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # 將幀轉換為灰度
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # 使用人臉檢測器檢測圖片中的所有人臉
    faces = detector(gray)

    # 遍歷每個人臉
    for face in faces:
        # 找到人臉的68個特徵點
        landmarks = predictor(gray, face)
    
        # 繪製特徵點
        for n in range(0, 68):
            x = landmarks.part(n).x
            y = landmarks.part(n).y
            cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)

    # 顯示結果
    cv2.imshow("Facial Landmarks", frame)

    # 按 'q' 鍵退出迴圈
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 釋放資源
cap.release()
cv2.destroyAllWindows()