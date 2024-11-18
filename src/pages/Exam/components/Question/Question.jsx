import {
    Card,
    CardBody,
    Button,
    CheckboxGroup,
    Checkbox,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
} from "@nextui-org/react";

import { useState, useEffect } from "react";

import { EmblaCarousel } from "./components/EmblaCarousel/EmblaCarousel";

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function Question({ question_data, nextQuestion }) {
    const { question, answers, explanation, images } = question_data;
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const [showAnswerStatus, setShowAnswerStatus] = useState(false);
    const [showAnswerOverwrite, setShowAnswerOverwrite] = useState(false);
    const [shuffledAnswers, setShuffledAnswers] = useState([]);

    const {
        isOpen: isOpenImages,
        onOpen: onOpenImages,
        onOpenChange: onOpenChangeImages,
    } = useDisclosure();

    const {
        isOpen: isOpenExplanation,
        onOpen: onOpenExplanation,
        onOpenChange: onOpenChangeExplanation,
    } = useDisclosure();

    const checkAnswers = () => {
        setShowAnswerStatus(true);
    };

    const seeAnswers = () => {
        setShowAnswerOverwrite(true);
    };

    const onAnswerChange = (newSelectedValues) => {
        setShowAnswerStatus(false);
        setShowAnswerOverwrite(false);
        setSelectedAnswers(newSelectedValues);
    };

    useEffect(() => {
        setSelectedAnswers([]);
        setShowAnswerStatus(false);
        setShowAnswerOverwrite(false);
        if (question_data.answers) {
            setShuffledAnswers(shuffleArray([...question_data.answers]));
        } else {
            setShuffledAnswers([]);
        }
    }, [question_data]);

    return (
        <>
            <Card className="p-4">
                <CardBody>
                    <p className="mb-4">
                        <strong>{question}</strong>
                    </p>
                    {shuffledAnswers && (
                        <CheckboxGroup
                            value={selectedAnswers}
                            onValueChange={onAnswerChange}
                        >
                            {shuffledAnswers.map((answer, index) => (
                                <Checkbox
                                    key={index}
                                    value={index}
                                    className="mb-2"
                                >
                                    {(showAnswerStatus &&
                                        selectedAnswers.includes(index)) ||
                                    showAnswerOverwrite ? (
                                        answer.is_correct ? (
                                            <span className="text-green-500">
                                                {answer.answer}
                                            </span>
                                        ) : (
                                            <span className="text-red-500">
                                                {answer.answer}
                                            </span>
                                        )
                                    ) : (
                                        answer.answer
                                    )}
                                </Checkbox>
                            ))}
                        </CheckboxGroup>
                    )}
                </CardBody>
            </Card>
            <Button onPress={checkAnswers} className="mr-4 mt-4 mb-4">
                Checar
            </Button>
            <Button
                onPress={onOpenImages}
                isDisabled={!images}
                className="mr-4 mt-4 mb-4"
            >
                Imagenes
            </Button>

            <Button
                onPress={onOpenChangeExplanation}
                isDisabled={!explanation}
                className="mr-4 mt-4 mb-4"
            >
                Explicación
            </Button>
            <Button onPress={seeAnswers} className="mr-4 mt-4 mb-4">
                Ver respuestas
            </Button>
            <Modal
                isOpen={isOpenImages}
                onOpenChange={onOpenChangeImages}
                size="3xl"
                className="dark text-foreground bg-background border border-white"
            >
                <ModalContent>
                    {(onClose) => (
                        <div className="w-full overflow-hidden">
                            <EmblaCarousel images={images} />
                        </div>
                    )}
                </ModalContent>
            </Modal>
            <Modal
                isOpen={isOpenExplanation}
                onOpenChange={onOpenChangeExplanation}
                size="3xl"
                className="dark text-foreground bg-background border border-white"
            >
                <ModalContent>
                    <ModalBody>
                        <p>{explanation}</p>
                    </ModalBody>
                </ModalContent>
            </Modal>
            <Button onPress={nextQuestion}>Siguiente</Button>
        </>
    );
}

export default Question;
